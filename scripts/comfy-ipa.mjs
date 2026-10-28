// 用 IP-Adapter 做“风格迁移”出图：把参考图当风格锚，笔触/色调/密度跟着它走，构图由提示词决定。
// 用法：node comfy-ipa.mjs <prompt> <neg> <w> <h> <steps> <seed> <styleImage> [weight] [startAt] [endAt]
// 环境变量：CKPT / CFG / SAMPLER / PREFIX / WEIGHT_TYPE（默认 style transfer）/ IPA_FILE / CV_FILE / LORA / LORA_W
// 依赖：custom_nodes/ComfyUI_IPAdapter_plus、models/ipadapter、models/clip_vision
import fs from "node:fs";
import path from "node:path";

const HOST = "http://127.0.0.1:8188";
const OUT_DIR = "D:\\AI\\ComfyUI_windows_portable\\ComfyUI\\output";
const DEST = "C:\\Users\\44186\\Documents\\deepseek-harness\\default-workspace\\shots-ai";

const [prompt, negative, wArg, hArg, stepsArg, seedArg, stylePath, weightArg, startArg, endArg] = process.argv.slice(2);
if (!prompt || !stylePath) {
  console.error("usage: node comfy-ipa.mjs <prompt> <neg> <w> <h> <steps> <seed> <styleImage> [weight] [startAt] [endAt]");
  process.exit(1);
}
const W = Number(wArg) || 1536;
const H = Number(hArg) || 864;
const STEPS = Number(stepsArg) || 32;
const SEED = Number(seedArg) || 1234;
const WEIGHT = Number(weightArg ?? 0.9);
const START = Number(startArg ?? 0);
const END = Number(endArg ?? 1);
const CKPT = process.env.CKPT || "NoobAI-XL-v1.1.safetensors";
const CFG = Number(process.env.CFG ?? 6);
const SAMPLER = process.env.SAMPLER || "euler_ancestral";
const PREFIX = process.env.PREFIX || "ipa";
const WEIGHT_TYPE = process.env.WEIGHT_TYPE || "style transfer";
const IPA_FILE = process.env.IPA_FILE || "ip-adapter-plus_sdxl_vit-h.safetensors";
const CV_FILE = process.env.CV_FILE || "clip-vit-h.safetensors";
const LORA = process.env.LORA || "";
const LORA_W = Number(process.env.LORA_W || 0.6);
const NEG = negative || "humans, person, 1girl, 1boy, text, watermark, signature, lowres, worst quality, low quality, blurry";

const uploadName = `${PREFIX}_${path.basename(stylePath)}`;
async function uploadImage(file) {
  const buf = fs.readFileSync(file);
  const form = new FormData();
  form.append("image", new Blob([buf], { type: "image/png" }), uploadName);
  form.append("overwrite", "true");
  const r = await fetch(`${HOST}/upload/image`, { method: "POST", body: form });
  if (!r.ok) throw new Error(`upload failed ${r.status}: ${await r.text()}`);
  return (await r.json()).name;
}

const imgName = await uploadImage(stylePath);

// 1 ckpt / 8 lora(可选) / 2-3 文本 / 4 latent / 9 参考图 / 10 ipadapter / 11 clip_vision / 12 apply / 5 sampler / 6 vae / 7 save
const modelSrc = LORA ? ["8", 0] : ["1", 0];
const clipSrc = LORA ? ["8", 1] : ["1", 1];
const graph = {
  1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: CKPT } },
  2: { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: clipSrc } },
  3: { class_type: "CLIPTextEncode", inputs: { text: NEG, clip: clipSrc } },
  4: { class_type: "EmptyLatentImage", inputs: { width: W, height: H, batch_size: 1 } },
  9: { class_type: "LoadImage", inputs: { image: imgName } },
  10: { class_type: "IPAdapterModelLoader", inputs: { ipadapter_file: IPA_FILE } },
  11: { class_type: "CLIPVisionLoader", inputs: { clip_name: CV_FILE } },
  12: {
    class_type: "IPAdapterAdvanced",
    inputs: {
      model: modelSrc,
      ipadapter: ["10", 0],
      image: ["9", 0],
      clip_vision: ["11", 0],
      weight: WEIGHT,
      weight_type: WEIGHT_TYPE,
      combine_embeds: "concat",
      start_at: START,
      end_at: END,
      embeds_scaling: "V only",
    },
  },
  5: {
    class_type: "KSampler",
    inputs: {
      seed: SEED,
      steps: STEPS,
      cfg: CFG,
      sampler_name: SAMPLER,
      scheduler: "normal",
      denoise: 1,
      model: ["12", 0],
      positive: ["2", 0],
      negative: ["3", 0],
      latent_image: ["4", 0],
    },
  },
  6: { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
  7: { class_type: "SaveImage", inputs: { filename_prefix: PREFIX, images: ["6", 0] } },
};
if (LORA) {
  graph[8] = {
    class_type: "LoraLoader",
    inputs: { lora_name: LORA, strength_model: LORA_W, strength_clip: LORA_W, model: ["1", 0], clip: ["1", 1] },
  };
}

const t0 = Date.now();
const res = await fetch(`${HOST}/prompt`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ prompt: graph, client_id: "ipa-" + SEED }),
});
if (!res.ok) {
  console.log("submit failed", res.status, await res.text());
  process.exit(1);
}
const { prompt_id } = await res.json();
console.log("queued", prompt_id, "seed", SEED, "size", W + "x" + H, "w", WEIGHT, WEIGHT_TYPE);

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
        const dst = path.join(DEST, `ai-${SEED}-${im.filename}`);
        fs.copyFileSync(src, dst);
        console.log("done", ((Date.now() - t0) / 1000).toFixed(1) + "s", dst);
      }
      process.exit(0);
    }
  }
}
console.log("timeout waiting for image");
process.exit(1);
