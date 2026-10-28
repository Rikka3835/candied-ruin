import fs from "node:fs";
import path from "node:path";

const HOST = "http://127.0.0.1:8188";
const OUT_DIR = "D:\\AI\\ComfyUI_windows_portable\\ComfyUI\\output";
const DEST = "C:\\Users\\44186\\Documents\\deepseek-harness\\default-workspace\\shots-ai";

const prompt = process.argv[2];
const negative = process.argv[3] || "humans, person, 1girl, 1boy, text, watermark, signature, lowres, worst quality, low quality, blurry, jpeg artifacts, bright, cheerful, colorful, cartoon";
const w = Number(process.argv[4] || 1216);
const h = Number(process.argv[5] || 704);
const steps = Number(process.argv[6] || 28);
const seed = Number(process.argv[7] || Math.floor(Math.random() * 1e9));
const ckpt = process.env.CKPT || "animagine-xl-3.1.safetensors";
const cfg = Number(process.env.CFG || 5.5);
const prefix = process.env.PREFIX || "bv";
const sampler = process.env.SAMPLER || "euler_ancestral";
// 可选 LoRA：LORA=文件名，LORA_W=权重（默认 0.6）
const lora = process.env.LORA || "";
const loraW = Number(process.env.LORA_W || 0.6);

const graph = {
  1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } },
  2: { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: lora ? ["8", 1] : ["1", 1] } },
  3: { class_type: "CLIPTextEncode", inputs: { text: negative, clip: lora ? ["8", 1] : ["1", 1] } },
  4: { class_type: "EmptyLatentImage", inputs: { width: w, height: h, batch_size: 1 } },
  5: {
    class_type: "KSampler",
    inputs: {
      seed,
      steps,
      cfg,
      sampler_name: sampler,
      scheduler: "normal",
      denoise: 1,
      model: lora ? ["8", 0] : ["1", 0],
      positive: ["2", 0],
      negative: ["3", 0],
      latent_image: ["4", 0],
    },
  },
  6: { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
  7: { class_type: "SaveImage", inputs: { filename_prefix: prefix, images: ["6", 0] } },
};

if (lora) {
  graph[8] = {
    class_type: "LoraLoader",
    inputs: {
      lora_name: lora,
      strength_model: loraW,
      strength_clip: loraW,
      model: ["1", 0],
      clip: ["1", 1],
    },
  };
}

const t0 = Date.now();
const res = await fetch(`${HOST}/prompt`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ prompt: graph, client_id: "bv-" + seed }),
});
if (!res.ok) {
  console.log("submit failed", res.status, await res.text());
  process.exit(1);
}
const { prompt_id } = await res.json();
console.log("queued", prompt_id, "seed", seed, "size", w + "x" + h);

for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const hr = await fetch(`${HOST}/history/${prompt_id}`);
  const hist = await hr.json();
  const entry = hist[prompt_id];
  if (entry?.outputs) {
    const imgs = entry.outputs["7"]?.images || [];
    if (imgs.length) {
      fs.mkdirSync(DEST, { recursive: true });
      for (const im of imgs) {
        const src = path.join(OUT_DIR, im.subfolder || "", im.filename);
        const dst = path.join(DEST, `ai-${seed}-${im.filename}`);
        fs.copyFileSync(src, dst);
        console.log("done", ((Date.now() - t0) / 1000).toFixed(1) + "s", dst);
      }
      process.exit(0);
    }
  }
}
console.log("timeout waiting for image");
process.exit(1);
