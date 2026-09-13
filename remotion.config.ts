import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// Vertical shorts are flat-color heavy; CRF 18 keeps gradients from banding.
Config.setCrf(18);
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setConcurrency(4);
