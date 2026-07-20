require("dotenv").config();

const {
  PollyClient,
  SynthesizeSpeechCommand,
} = require("@aws-sdk/client-polly");

const region = process.env.AWS_REGION;

const polly = new PollyClient({ region });

module.exports = {
  polly,
  SynthesizeSpeechCommand,
};