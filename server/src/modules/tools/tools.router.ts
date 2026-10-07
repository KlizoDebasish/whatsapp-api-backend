import { Router, Request, Response } from "express";
import { executeBrowserQuery } from "../../utils/browser-query-tool";
import { generateImageWithGemini } from "../../utils/image-generator";

const router = Router();

router.post("/browser-query", async (req: Request, res: Response) => {
  try {
    const { url, query } = req.body;
    const result = await executeBrowserQuery(url, query);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Browser query failed" });
  }
});

router.post("/image-generate", async (req: Request, res: Response) => {
  try {
    const { prompt, aspectRatio } = req.body;
    const result = await generateImageWithGemini(prompt, aspectRatio);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Image generation failed" });
  }
});

export default router;
