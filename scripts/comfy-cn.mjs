// 用 ControlNet 锁布局出图：先上传线稿，再跑 graph。
// 用法：node comfy-cn.mjs <prompt> <neg> <w> <h> <steps> <seed> <lineartPng> [strength] [end]
// 环境变量：CKPT / CFG / SAMPLER / CN / PREFIX
import fs from "node:fs";
import path from "node:path";

const HOST = "http://127.0.0.1:8188";
const [prompt, neg, wArg, hArg, stepsArg, seedArg, artPath, strengthArg, endArg] = process.argv.slice(2);
if (!prompt || !artPath) {
  console.error("usage: node comfy-cn.mjs <prompt> <neg> <w> <h> <steps> <seed> <lineartPng> [strength] [end]");
  process.exit(1);
}
const W = Number(wArg) || 1536;
const H = Number(hArg) || 864;
const STEPS = Number(stepsArg) || 30;
const SEED = Number(seedArg) || 1234;
const STRENGTH = Number(strengthArg ?? 0.85);
const END = Number(endArg ?? 1.0);
const CKPT = process.env.CKPT || "Illustrious-XL-v1.1.safetensors";
const CFG = Number(process.env.CFG ?? 6);
const SAMPLER = process.env.SAMPLER || "euler_ancestral";
const CN = process.env.CN || "controlnet-union-sdxl-1.0\\diffusion_pytorch_model.safetensors";
const PREFIX = process.env.PREFIX || "cn";
// 可选 LoRA（和 comfy-gen.mjs 同一套环境变量）
const LORA = process.env.LORA || "";
const LORA_W = Number(process.env.LORA_W || 0.6);

const uploadName = `${PREFIX}_${path.basename(artPath)}`;

async function uploadImage(file) {
  const buf = fs.readFileSync(file);
  const form = new FormData();
  form.append("image", new Blob([buf], { type: "image/png" }), uploadName);
  form.append("overwrite", "true");
  const r = await fetch(`${HOST}/upload/image`, { method: "POST", body: form });
  if (!r.ok) throw new Error(`upload failed ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.name;
}

function graph(imgName) {
  const g = {
    1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: CKPT } },
    2: { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: LORA ? ["11", 1] : ["1", 1] } },
    3: { class_type: "CLIPTextEncode", inputs: { text: neg, clip: LORA ? ["11", 1] : ["1", 1] } },
    4: { class_type: "ControlNetLoader", inputs: { control_net_name: CN } },
    5: { class_type: "LoadImage", inputs: { image: imgName } },
    6: {
      class_type: "ControlNetApplyAdvanced",
      inputs: {
        positive: ["2", 0],
        negative: ["3", 0],
        control_net: ["4", 0],
        image: ["5", 0],
        strength: STRENGTH,
        start_percent: 0,
        end_percent: END,
      },
    },
    7: { class_type: "EmptyLatentImage", inputs: { width: W, height: H, batch_size: 1 } },
    8: {
      class_type: "KSampler",
      inputs: {
        seed: SEED,
        steps: STEPS,
        cfg: CFG,
        sampler_name: SAMPLER,
        scheduler: "normal",
        denoise: 1,
        model: LORA ? ["11", 0] : ["1", 0],
        positive: ["6", 0],
        negative: ["6", 1],
        latent_image: ["7", 0],
      },
    },
    9: { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["1", 2] } },
    10: { class_type: "SaveImage", inputs: { filename_prefix: PREFIX, images: ["9", 0] } },
  };
  if (LORA) {
    g[11] = {
      class_type: "LoraLoader",
      inputs: {
        lora_name: LORA,
        strength_model: LORA_W,
        strength_clip: LORA_W,
        model: ["1", 0],
        clip: ["1", 1],
      },
    };
  }
  return g;
}

const t0 = Date.now();
const imgName = await uploadImage(artPath);
const res = await fetch(`${HOST}/prompt`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ prompt: graph(imgName) }),
});
if (!res.ok) throw new Error(`prompt failed ${res.status}: ${await res.text()}`);
const { prompt_id } = await res.json();

for (;;) {
  await new Promise((r) => setTimeout(r, 800));
  const h = await fetch(`${HOST}/history/${prompt_id}`).then((r) => r.json());
  const entry = h[prompt_id];
  if (entry?.outputs) {
    const out = entry.outputs[10]?.images?.[0];
    if (out) {
      const src = path.join("D:\\AI\\ComfyUI_windows_portable\\ComfyUI\\output", out.subfolder || "", out.filename);
      const dst = path.join("C:\\Users\\44186\\Documents\\deepseek-harness\\default-workspace\\shots-ai",
        `ai-${SEED}-${out.filename}`);
      fs.copyFileSync(src, dst);
      console.log(`done ${((Date.now() - t0) / 1000).toFixed(1)}s ${dst}`);
      process.exit(0);
    }
  }
  if (entry?.status?.status_str === "error") {
    console.error("error", JSON.stringify(entry.status).slice(0, 500));
    process.exit(2);
  }
  if (Date.now() - t0 > 10 * 60 * 1000) {
    console.error("timeout");
    process.exit(3);
  }
}
