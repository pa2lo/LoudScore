self.onmessage = (e) => {
	try {
		const { channels, sampleRate } = e.data;
		const numChannels = channels.length;

		const audioBuffer = {
			sampleRate,
			numberOfChannels: numChannels,
			length: channels[0].length,
			getChannelData: (i) => channels[i]
		};

		const lufs = calculateLUFS(audioBuffer);
		const truePeak = calculateTruePeak(audioBuffer);
		const waveform = generateTimeBasedWaveform(audioBuffer);

		const spotifyPenalty = Math.min(-14 - lufs, Math.max(0, -1 - truePeak));
		const youtubePenalty = Math.min(0, -14 - lufs);
		const applePenalty = -16 - lufs;

		self.postMessage({
			lufs,
			truePeak,
			waveform,
			spotify: spotifyPenalty,
			youtube: youtubePenalty,
			apple: applePenalty
		});
	} catch (err) {
		self.postMessage({
			error: `Worker error: ${err.message}`
		});
	}
};

// Convolver class
class Convolver {
	constructor(kernel) {
		this.kernel = new Float32Array(kernel);
		this.savedSamples = new Float32Array(kernel.length - 1);
	}

	process(input) {
		const output = new Float32Array(input.length);

		for (let n = 0; n < input.length; n++) {
			let sum = 0;
			const maxK = Math.min(this.kernel.length, n + 1);

			for (let k = 0; k < maxK; k++) {
				sum += this.kernel[k] * input[n - k];
			}
			output[n] = sum;
		}

		for (let n = 0; n < this.savedSamples.length; n++) {
			output[n] += this.savedSamples[n];
		}

		for (let n = 0; n < this.savedSamples.length; n++) {
			let sum = 0;
			const startK = n + 1;
			const maxK = Math.min(this.kernel.length, input.length + n + 1);

			for (let k = startK; k < maxK; k++) {
				sum += this.kernel[k] * input[input.length - (k - n)];
			}
			this.savedSamples[n] = sum;
		}

		return output;
	}

	reset() {
		this.savedSamples.fill(0);
	}
}

// IIR Filter class
class IIRFilter {
	constructor(nChannels, feedforward, feedback) {
		this.nChannels = nChannels;
		this.feedback = Array.from(feedback);
		this.nextSample = 0;
		this.buffers = [];
		this.convolvers = [];

		for (let i = 0; i < nChannels; i++) {
			this.buffers.push(new Float32Array(feedback.length).fill(0));
			this.convolvers.push(new Convolver(feedforward));
		}
	}

	process(inputBuffer, outputBuffer) {
		for (let ch = 0; ch < this.nChannels; ch++) {
			const input = inputBuffer[ch];
			const output = outputBuffer[ch];
			const buffer = this.buffers[ch];

			const convolved = this.convolvers[ch].process(input);

			let bufferIndex = this.nextSample;

			for (let i = 0; i < convolved.length; i++) {
				let y = this.feedback[0] * convolved[i];

				for (let j = 1; j < this.feedback.length; j++) {
					const idx = (bufferIndex + j) % this.feedback.length;
					y -= this.feedback[j] * buffer[idx];
				}

				buffer[bufferIndex] = y;
				output[i] = y;

				bufferIndex--;
				if (bufferIndex < 0) {
					bufferIndex = this.feedback.length - 1;
				}
			}

			if (ch === this.nChannels - 1) {
				this.nextSample = bufferIndex;
			}
		}
	}

	reset() {
		this.buffers.forEach(buf => buf.fill(0));
		this.convolvers.forEach(conv => conv.reset());
		this.nextSample = 0;
	}
}

// Generate time-based waveform segments (every X seconds)
function generateTimeBasedWaveform(audioBuffer) {
	const sampleRate = audioBuffer.sampleRate;
	const channelData = audioBuffer.getChannelData(0);
	const samplesPerSegment = Math.floor(sampleRate * 1);
	const totalSegments = Math.ceil(channelData.length / samplesPerSegment);
	const waveform = [];

	for (let i = 0; i < totalSegments; i++) {
		let sum = 0;
		const start = i * samplesPerSegment;
		const end = Math.min(start + samplesPerSegment, channelData.length);

		for (let j = start; j < end; j++) {
			sum += Math.abs(channelData[j]);
		}

		const average = sum / (end - start);
		const normalized = Math.min(100, average * 300);
		waveform.push(normalized);
	}

	return waveform;
}

// Calculate LUFS
function calculateLUFS(audioBuffer) {
	const sampleRate = audioBuffer.sampleRate;
	const numChannels = audioBuffer.numberOfChannels;

	let stageOneB, stageOneA, stageTwoB, stageTwoA;

	if (sampleRate === 48000) {
		stageOneB = [1.53512485958697, -2.69169618940638, 1.19839281085285];
		stageOneA = [1.0, -1.69065929318241, 0.73248077421585];
		stageTwoB = [1.0, -2.0, 1.0];
		stageTwoA = [1.0, -1.99004745483398, 0.99007225036621];
	} else if (sampleRate === 44100) {
		stageOneB = [1.53088, -2.65135, 1.16934];
		stageOneA = [1.0, -1.6639, 0.712775];
		stageTwoB = [1.0, -2.0, 1.0];
		stageTwoA = [1.0, -1.98917, 0.989199];
	} else {
		throw new Error(`Sample rate ${sampleRate} not supported. Use 44.1kHz or 48kHz`);
	}

	const channelWeights = [1, 1, 1, 1.41, 1.41];
	const weights = channelWeights.slice(0, numChannels);

	const filter1 = new IIRFilter(numChannels, stageOneB, stageOneA);
	const filter2 = new IIRFilter(numChannels, stageTwoB, stageTwoA);

	const blockDuration = 0.4;
	const blockSize = Math.floor(blockDuration * sampleRate);
	const hopSize = Math.floor(0.1 * sampleRate);

	const channelData = [];
	for (let i = 0; i < numChannels; i++) {
		channelData.push(new Float32Array(audioBuffer.getChannelData(i)));
	}

	const blockPowers = [];
	const chunkSize = 4096;
	let processedSamples = 0;

	for (let start = 0; start < audioBuffer.length; start += chunkSize) {
		const end = Math.min(start + chunkSize, audioBuffer.length);
		const chunkLength = end - start;

		const inputChunk = channelData.map(ch => ch.slice(start, end));
		const tempChunk = inputChunk.map(() => new Float32Array(chunkLength));
		const outputChunk = inputChunk.map(() => new Float32Array(chunkLength));

		filter1.process(inputChunk, tempChunk);
		filter2.process(tempChunk, outputChunk);

		for (let ch = 0; ch < numChannels; ch++) {
			channelData[ch].set(outputChunk[ch], start);
		}

		processedSamples += chunkLength;
	}

	let position = 0;
	while (position + blockSize <= audioBuffer.length) {
		let blockPower = 0;

		for (let ch = 0; ch < numChannels; ch++) {
			let channelPower = 0;
			for (let i = 0; i < blockSize; i++) {
				const sample = channelData[ch][position + i];
				channelPower += sample * sample;
			}
			blockPower += weights[ch] * (channelPower / blockSize);
		}

		blockPowers.push(blockPower);
		position += hopSize;
	}

	const absThreshold = Math.pow(10, -70 / 10);
	const gatedBlocks = blockPowers.filter(p => p > absThreshold);

	if (gatedBlocks.length === 0) {
		return -70.0;
	}

	const avgPower = gatedBlocks.reduce((sum, p) => sum + p, 0) / gatedBlocks.length;
	const relThreshold = avgPower * Math.pow(10, -10 / 10);

	const finalBlocks = gatedBlocks.filter(p => p >= relThreshold);

	if (finalBlocks.length === 0) {
		return -70.0;
	}

	const finalPower = finalBlocks.reduce((sum, p) => sum + p, 0) / finalBlocks.length;

	const lufs = -0.691 + 10 * Math.log10(finalPower);
	return lufs;
}

// Calculate True Peak
function calculateTruePeak(audioBuffer) {
	let maxPeak = 0;

	for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
		const channelData = audioBuffer.getChannelData(ch);
		for (let i = 0; i < channelData.length; i++) {
			const absValue = Math.abs(channelData[i]);
			if (absValue > maxPeak) {
				maxPeak = absValue;
			}
		}
	}

	return 20 * Math.log10(Math.max(maxPeak, 1e-10));
}