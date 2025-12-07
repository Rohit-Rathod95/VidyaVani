// awsClients.js
require("dotenv").config();

const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const {
  PollyClient,
  SynthesizeSpeechCommand,
} = require("@aws-sdk/client-polly");

const region = process.env.AWS_REGION;

const bedrock = new BedrockRuntimeClient({ region });
const polly = new PollyClient({ region });

module.exports = {
  bedrock,
  polly,
  InvokeModelCommand,
  SynthesizeSpeechCommand,
};
