// 本地超分：把一张图送进 ComfyUI 的 UpscaleModelLoader 放大后取回。
// 用法：node comfy-upscale.mjs <输入图片绝对路径> <模型文件名> [输出前缀]
// 依赖：ComfyUI 已在 127.0.0.1:8188 运行；模型放在 models/upscale_models/。
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const HOST = process.env.COMFY_HOST || "http://127.0.0.1:8188";
const OUT_DIR = process.env.COMFY_OUT || "D:\\AI\\ComfyUI_windows_portable\\ComfyUI\\output";

const src = process.argv[2];
const model = process.argv[3] || "4x-UltraSharp.pth";
const prefix = process.argv[4] || "up";
if (!src || !fs.existsSync(src)) {
  console.error("缺少输入图片或文件不存在：", src);
  process.exit(1);
}

async function upload(absPath) {
  const buf = fs.readFileSync(absPath);
  const name = `${prefix}_${randomUUID().slice(0, 8)}${path.extname(absPath)}`;
  const fd = new FormData();
  fd.append("image", new Blob([buf]), name);
  fd.append("overwrite", "true");
  const r = await fetch(`${HOST}/upload/image`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(`upload failed ${r.status}`);
  const j = await r.json();
  return j.name;
}

async function run(uploadedName) {
  const wf = {
    1: { class_type: "LoadImage", inputs: { image: uploadedName } },
    2: { class_type: "UpscaleModelLoader", inputs: { model_name: model } },
    3: { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["2", 0], image: ["1", 0] } },
    4: { class_type: "SaveImage", inputs: { images: ["3", 0], filename_prefix: prefix } },
  };
  const r = await fetch(`${HOST}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: wf, client_id: randomUUID() }),
  });
  if (!r.ok) throw new Error(`prompt failed ${r.status} ${await r.text()}`);
  const { prompt_id } = await r.json();

  const t0 = Date.now();
  for (;;) {
    await new Promise((res) => setTimeout(res, 1200));
    const h = await fetch(`${HOST}/history/${prompt_id}`).then((x) => x.json());
    const entry = h[prompt_id];
    if (entry?.outputs) {
      const imgs = Object.values(entry.outputs).flatMap((o) => o.images || []);
      if (imgs.length) return { img: imgs[0], ms: Date.now() - t0 };
    }
    if (Date.now() - t0 > 10 * 60 * 1000) throw new Error("timeout");
  }
}

const upName = await upload(path.resolve(src));
const { img, ms } = await run(upName);
const outPath = path.join(OUT_DIR, img.subfolder || "", img.filename);
console.log(`done ${(ms / 1000).toFixed(1)}s ${outPath}`);
