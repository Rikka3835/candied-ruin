// img2img / 高清重绘：读取 ComfyUI/input 下的图，缩放后以低 denoise 重绘
import fs from "node:fs";
import path from "node:path";

const HOST = "http://127.0.0.1:8188";
const OUT_DIR = "D:\\AI\\ComfyUI_windows_portable\\ComfyUI\\output";
const DEST = "C:\\Users\\44186\\Documents\\deepseek-harness\\default-workspace\\shots-ai";

const image = process.argv[2];            // ComfyUI/input 里的文件名
const prompt = process.argv[3];
const negative = process.argv[4] || "";
const w = Number(process.argv[5] || 1920);
const h = Number(process.argv[6] || 1080);
const steps = Number(process.argv[7] || 36);
const denoise = Number(process.argv[8] || 0.38);
const seed = Number(process.argv[9] || Math.floor(Math.random() * 1e9));

const ckpt = process.env.CKPT || "animagine-xl-3.1.safetensors";
const cfg = Number(process.env.CFG || 5.5);
const prefix = process.env.PREFIX || "i2i";

const graph = {
  1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } },
  2: { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1", 1] } },
  3: { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["1", 1] } },
  4: { class_type: "LoadImage", inputs: { image } },
  5: {
    class_type: "ImageScale",
    inputs: { upscale_method: "lanczos", width: w, height: h, crop: "disabled", image: ["4", 0] },
  },
  6: { class_type: "VAEEncode", inputs: { pixels: ["5", 0], vae: ["1", 2] } },
  7: {
    class_type: "KSampler",
    inputs: {
      seed,
      steps,
      cfg,
      sampler_name: "euler_ancestral",
      scheduler: "normal",
      denoise,
      model: ["1", 0],
      positive: ["2", 0],
      negative: ["3", 0],
      latent_image: ["6", 0],
    },
  },
  8: { class_type: "VAEDecode", inputs: { samples: ["7", 0], vae: ["1", 2] } },
  9: { class_type: "SaveImage", inputs: { filename_prefix: prefix, images: ["8", 0] } },
};

const t0 = Date.now();
const res = await fetch(`${HOST}/prompt`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ prompt: graph, client_id: "bv-i2i-" + seed }),
});
if (!res.ok) {
  console.log("submit failed", res.status, await res.text());
  process.exit(1);
}
const { prompt_id } = await res.json();
console.log("queued", prompt_id, "seed", seed, "size", w + "x" + h, "denoise", denoise);

for (let i = 0; i < 900; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const hr = await fetch(`${HOST}/history/${prompt_id}`);
  const hist = await hr.json();
  const entry = hist[prompt_id];
  if (entry?.outputs) {
    const imgs = entry.outputs["9"]?.images || [];
    if (imgs.length) {
      fs.mkdirSync(DEST, { recursive: true });
      for (const im of imgs) {
        const src = path.join(OUT_DIR, im.subfolder || "", im.filename);
        const dst = path.join(DEST, `i2i-${seed}-${im.filename}`);
        fs.copyFileSync(src, dst);
        console.log("done", ((Date.now() - t0) / 1000).toFixed(1) + "s", dst);
      }
      process.exit(0);
    }
  }
}
console.log("timeout waiting for image");
process.exit(1);
