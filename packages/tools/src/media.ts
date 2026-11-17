import { z } from "zod";
import { chat } from "@pocket/core";
import { resolveModels } from "@pocket/core";
import { defineTool } from "./helpers.js";

export const visionAnalyze = defineTool({
  name: "vision_analyze",
  description:
    "Analyse an image from a public URL or a data: URL. Use it for screenshots, charts, photos and scanned documents.",
  schema: z.object({
    image_url: z.string().min(8),
    question: z.string().min(3).max(600).default("Describe this image in detail."),
  }),
  risk: "safe",
  toolsets: ["media"],
  timeoutMs: 90_000,
  label: "Looking at an image",
  async run(input) {
    const chain = await resolveModels("vision");
    if (chain.length === 0) {
      throw new Error("No vision model is configured. Add one in Settings → Models.");
    }

    let lastError: unknown = null;
    for (const model of chain) {
      try {
        const result = await chat({
          baseUrl: model.baseUrl,
          apiKey: model.apiKey,
          model: model.model,
          provider: model.provider,
          maxTokens: 1200,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: input.question },
                { type: "image_url", image_url: { url: input.image_url } },
              ] as any,
            },
          ],
        });
        return { answer: result.content, model: model.model };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Vision request failed");
  },
});
