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
const TOKEN_IMAGE_PATH = path.resolve(__dirname, "../../public/logo-token.png");

@Controller("solana")
export class SolanaController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Off-chain metadata JSON referenced by the token's on-chain `uri`. */
  @Get("token-metadata")
  tokenMetadata(): TokenMetadataResponse {
    const apiUrl = this.config.get("API_URL", { infer: true }).replace(/\/+$/, "");
    return {
      name: "OpenMerge Token",
      symbol: "OMT",
      description: "Official token of the OpenMerge project",
      image: `${apiUrl}/api/solana/token-image`,
    };
  }

  @Get("token-image")
  tokenImage(): StreamableFile {
    return new StreamableFile(createReadStream(TOKEN_IMAGE_PATH), {
      type: "image/png",
    });
  }
}
