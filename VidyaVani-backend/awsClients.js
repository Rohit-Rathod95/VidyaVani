require("dotenv").config();

const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const {
  PollyClient,
  SynthesizeSpeechCommand,
} = require("@aws-sdk/client-polly");

const {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} = require("@aws-sdk/client-transcribe-streaming");

const region = process.env.AWS_REGION;

const bedrock = new BedrockRuntimeClient({ region });
const polly = new PollyClient({ region });
const transcribe = new TranscribeStreamingClient({ region });

module.exports = {
  bedrock,
  polly,
  transcribe,
  InvokeModelCommand,
  SynthesizeSpeechCommand,
  StartStreamTranscriptionCommand,
};