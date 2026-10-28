// 双锁出图：ControlNet 锁构图 + IP-Adapter 锁画风。
// 用法：node comfy-cnip.mjs <prompt> <neg> <w> <h> <steps> <seed> <控制线稿> <风格图> [cnStrength] [ipaWeight]
// 环境变量：CKPT / CFG / SAMPLER / PREFIX / WEIGHT_TYPE / CN_START / CN_END / LORA / LORA_W
import fs from "node:fs";
import path from "node:path";

const HOST = "http://127.0.0.1:8188";
const OUT_DIR = "D:\\AI\\ComfyUI_windows_portable\\ComfyUI\\output";
const DEST = "C:\\Users\\44186\\Documents\\deepseek-harness\\default-workspace\\shots-ai";

const [prompt, negative, wArg, hArg, stepsArg, seedArg, ctlPath, stylePath, cnArg, ipaArg] = process.argv.slice(2);
if (!prompt || !ctlPath || !stylePath) {
  console.error("usage: node comfy-cnip.mjs <prompt> <neg> <w> <h> <steps> <seed> <control> <style> [cnStrength] [ipaWeight]");
  process.exit(1);
}
const W = Number(wArg) || 1536;
const H = Number(hArg) || 864;
const STEPS = Number(stepsArg) || 30;
const SEED = Number(seedArg) || 1234;
const CN_STRENGTH = Number(cnArg ?? 0.55);
const IPA_WEIGHT = Number(ipaArg ?? 0.45);
const CKPT = process.env.CKPT || "NoobAI-XL-v1.1.safetensors";
const CFG = Number(process.env.CFG ?? 6);
const SAMPLER = process.env.SAMPLER || "euler_ancestral";
const PREFIX = process.env.PREFIX || "cnip";
const WEIGHT_TYPE = process.env.WEIGHT_TYPE || "style transfer";
const CN_START = Number(process.env.CN_START ?? 0);
const CN_END = Number(process.env.CN_END ?? 0.85);
const LORA = process.env.LORA || "";
const LORA_W = Number(process.env.LORA_W || 0.6);
const NEG = negative || "humans, person, 1girl, 1boy, text, watermark, signature, lowres, worst quality, low quality, blurry";

async function upload(file, name) {
  const buf = fs.readFileSync(file);
  const form = new FormData();
  form.append("image", new Blob([buf], { type: "image/png" }), name);
  form.append("overwrite", "true");
  const r = await fetch(`${HOST}/upload/image`, { method: "POST", body: form });
  if (!r.ok) throw new Error(`upload failed ${r.status}: ${await r.text()}`);
  return (await r.json()).name;
}
const ctlName = await upload(ctlPath, `${PREFIX}_ctl_${path.basename(ctlPath)}`);
const styleName = await upload(stylePath, `${PREFIX}_sty_${path.basename(stylePath)}`);

const modelSrc = LORA ? ["8", 0] : ["1", 0];
const clipSrc = LORA ? ["8", 1] : ["1", 1];

const graph = {
  1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: CKPT } },
  2: { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: clipSrc } },
  3: { class_type: "CLIPTextEncode", inputs: { text: NEG, clip: clipSrc } },
  4: { class_type: "EmptyLatentImage", inputs: { width: W, height: H, batch_size: 1 } },
  // ControlNet 支路
  20: { class_type: "LoadImage", inputs: { image: ctlName } },
  21: { class_type: "ControlNetLoader", inputs: { control_net_name: "controlnet-union-sdxl-1.0\\diffusion_pytorch_model.safetensors" } },
  22: {
    class_type: "ControlNetApplyAdvanced",
    inputs: {
      positive: ["2", 0],
      negative: ["3", 0],
      control_net: ["21", 0],
      image: ["20", 0],
      strength: CN_STRENGTH,
      start_percent: CN_START,
      end_percent: CN_END,
    },
  },
  // IP-Adapter 支路
  30: { class_type: "LoadImage", inputs: { image: styleName } },
  31: { class_type: "IPAdapterModelLoader", inputs: { ipadapter_file: "ip-adapter-plus_sdxl_vit-h.safetensors" } },
  32: { class_type: "CLIPVisionLoader", inputs: { clip_name: "clip-vit-h.safetensors" } },
  33: {
    class_type: "IPAdapterAdvanced",
    inputs: {
      model: modelSrc,
      ipadapter: ["31", 0],
      image: ["30", 0],
      clip_vision: ["32", 0],
      weight: IPA_WEIGHT,
      weight_type: WEIGHT_TYPE,
      combine_embeds: "concat",
      start_at: 0,
      end_at: 1,
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
      model: ["33", 0],
      positive: ["22", 0],
      negative: ["22", 1],
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
  body: JSON.stringify({ prompt: graph, client_id: "cnip-" + SEED }),
});
if (!res.ok) {
  console.log("submit failed", res.status, await res.text());
  process.exit(1);
}
const { prompt_id } = await res.json();
console.log("queued", prompt_id, "seed", SEED, "cn", CN_STRENGTH, "ipa", IPA_WEIGHT);

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
