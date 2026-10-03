import { createReadStream } from "node:fs";
import * as path from "node:path";
import { Controller, Get, StreamableFile } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";

export interface TokenMetadataResponse {
  name: string;
  symbol: string;
  description: string;
  image: string;
}

// Resolves from dist/solana at runtime to apps/api/public.
const TOKEN_IMAGE_PATH = path.resolve(__dirname, "../../public/token-logo.png");

@Controller("solana")
export class SolanaController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Off-chain metadata JSON referenced by the token's on-chain `uri`. */
  @Get("token-metadata")
  tokenMetadata(): TokenMetadataResponse {
    // In dev WEB_ORIGIN is the Vite server, which proxies /api to this API.
    const origin = this.config.get("WEB_ORIGIN", { infer: true }).replace(/\/+$/, "");
    return {
      name: "OpenMerge Token",
      symbol: "OMT",
      description: "Official token of the OpenMerge project",
      image: `${origin}/api/solana/token-image`,
    };
  }

  @Get("token-image")
  tokenImage(): StreamableFile {
    return new StreamableFile(createReadStream(TOKEN_IMAGE_PATH), {
      type: "image/png",
    });
  }
}
