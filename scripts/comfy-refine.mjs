// img2img 精修：拿一张已有的图，用较低 denoise 加材质/光影，结构基本保留。
// 用法：node comfy-refine.mjs <srcPng> <prompt> <neg> <steps> <seed> [denoise]
// 环境变量：CKPT / CFG / SAMPLER / LORA / LORA_W / PREFIX
import fs from "node:fs";
import path from "node:path";

const HOST = "http://127.0.0.1:8188";
const OUT_DIR = "D:\\AI\\ComfyUI_windows_portable\\ComfyUI\\output";
const DEST = "C:\\Users\\44186\\Documents\\deepseek-harness\\default-workspace\\shots-ai";

const [srcPath, prompt, neg, stepsArg, seedArg, denoiseArg] = process.argv.slice(2);
if (!srcPath || !prompt) {
  console.error("usage: node comfy-refine.mjs <srcPng> <prompt> <neg> <steps> <seed> [denoise]");
  process.exit(1);
}
const STEPS = Number(stepsArg) || 30;
const SEED = Number(seedArg) || 1234;
const DENOISE = Number(denoiseArg ?? 0.4);
const CKPT = process.env.CKPT || "NoobAI-XL-v1.1.safetensors";
const CFG = Number(process.env.CFG ?? 6);
const SAMPLER = process.env.SAMPLER || "euler_ancestral";
const PREFIX = process.env.PREFIX || "refine";
const LORA = process.env.LORA || "";
const LORA_W = Number(process.env.LORA_W || 0.6);

const uploadName = `${PREFIX}_${path.basename(srcPath)}`;
const buf = fs.readFileSync(srcPath);
const form = new FormData();
form.append("image", new Blob([buf], { type: "image/png" }), uploadName);
form.append("overwrite", "true");
const up = await fetch(`${HOST}/upload/image`, { method: "POST", body: form });
if (!up.ok) throw new Error(`upload failed ${up.status}: ${await up.text()}`);
const { name: imgName } = await up.json();

const g = {
  1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: CKPT } },
  2: { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: LORA ? ["11", 1] : ["1", 1] } },
  3: { class_type: "CLIPTextEncode", inputs: { text: neg, clip: LORA ? ["11", 1] : ["1", 1] } },
  4: { class_type: "LoadImage", inputs: { image: imgName } },
  5: { class_type: "VAEEncode", inputs: { pixels: ["4", 0], vae: ["1", 2] } },
  6: {
    class_type: "KSampler",
    inputs: {
      seed: SEED,
      steps: STEPS,
      cfg: CFG,
      sampler_name: SAMPLER,
      scheduler: "normal",
      denoise: DENOISE,
      model: LORA ? ["11", 0] : ["1", 0],
      positive: ["2", 0],
      negative: ["3", 0],
      latent_image: ["5", 0],
    },
  },
  7: { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["1", 2] } },
  8: { class_type: "SaveImage", inputs: { filename_prefix: PREFIX, images: ["7", 0] } },
};
if (LORA) {
  g[11] = {
    class_type: "LoraLoader",
    inputs: { lora_name: LORA, strength_model: LORA_W, strength_clip: LORA_W, model: ["1", 0], clip: ["1", 1] },
  };
}

const t0 = Date.now();
const res = await fetch(`${HOST}/prompt`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ prompt: g, client_id: "refine-" + SEED }),
});
if (!res.ok) throw new Error(`prompt failed ${res.status}: ${await res.text()}`);
const { prompt_id } = await res.json();
console.log("queued", prompt_id, "denoise", DENOISE);

for (let i = 0; i < 900; i++) {
  await new Promise((r) => setTimeout(r, 800));
  const hist = await fetch(`${HOST}/history/${prompt_id}`).then((r) => r.json());
  const entry = hist[prompt_id];
  const imgs = entry?.outputs?.["8"]?.images || [];
  if (imgs.length) {
    fs.mkdirSync(DEST, { recursive: true });
    for (const im of imgs) {
      const src = path.join(OUT_DIR, im.subfolder || "", im.filename);
      const dst = path.join(DEST, `ai-${SEED}-${im.filename}`);
      fs.copyFileSync(src, dst);
      console.log("done", ((Date.now() - t0) / 1000).toFixed(1) + "s", dst);
    }
    process.exit(0);
  }
}
console.log("timeout");
process.exit(1);
