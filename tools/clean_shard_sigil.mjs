import sharp from 'sharp';

const input = process.argv[2] || 'shard-statusbar/assets/orb-sigil.png';
const output = process.argv[3] || 'shard-statusbar/assets/orb-sigil-transparent.png';
const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

for (let index = 0; index < data.length; index += 4) {
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum;
  const brightness = maximum / 255;
  // ImageGen represented transparency as a white checkerboard. Remove only
  // low-saturation bright pixels so the colored crystal glow remains intact.
  if (brightness > 0.88 && saturation < 0.12) data[index + 3] = 0;
  else if (brightness > 0.76 && saturation < 0.18) {
    data[index + 3] = Math.round(data[index + 3] * ((brightness - 0.76) / 0.12));
  }
}

await sharp(data, {
  raw: { width: info.width, height: info.height, channels: 4 },
}).png().toFile(output);

console.log(`${output}: ${info.width}x${info.height}`);
