import sharp from "sharp";

export async function composeDeterministicSocialCard(input: {
  width?: number;
  height?: number;
  accent?: string;
  background?: string;
  output: string;
}): Promise<void> {
  const width = input.width ?? 1080;
  const height = input.height ?? 1080;
  const background = input.background ?? "#f6f5f2";
  const accent = input.accent ?? "#f05a28";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="${background}"/>
    <rect x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.07)}"
      width="${Math.round(width * 0.86)}" height="${Math.round(height * 0.86)}"
      rx="${Math.round(width * 0.035)}" fill="#ffffff"/>
    <circle cx="${Math.round(width * 0.84)}" cy="${Math.round(height * 0.16)}"
      r="${Math.round(width * 0.018)}" fill="${accent}"/>
    <path d="M ${Math.round(width * 0.12)} ${Math.round(height * 0.76)}
      H ${Math.round(width * 0.88)}" stroke="#18181b" stroke-width="${Math.round(width * 0.012)}"/>
  </svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 88 }).toFile(input.output);
}
