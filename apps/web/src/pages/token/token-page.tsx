import { ArrowUpRight } from 'lucide-react';
import { env } from '@/lib/env';
import { addressUrl } from '@/lib/explorer';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import tokenImage from '@/assets/omt-token.webp';
import { TokenFacts } from './token-facts';

export function TokenPage() {
  return (
    <Container className="grid items-center gap-8 pt-10 sm:pt-16 md:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)] md:gap-12 lg:gap-16 lg:pt-20">
      <img
        src={tokenImage}
        alt="OpenMerge Token (OMT) logo"
        width={640}
        height={640}
        className="w-32 rounded-lg border sm:w-40 md:order-last md:w-full md:max-w-[400px] md:justify-self-center"
      />
      <div>
        <p className="label">Our own token</p>
        <h1 className="mt-4 text-[34px] leading-[1.1] font-semibold tracking-[-0.025em] sm:text-[44px]">
          OpenMerge Token <span className="data font-medium text-fg-subtle">OMT</span>
        </h1>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-fg-muted">
          We created our own token for OpenMerge. Every bounty is locked and paid out in OMT, on Solana&apos;s public
          blockchain, where anyone can check each transfer.
        </p>
        <div className="mt-8 max-w-xl">
          <TokenFacts />
        </div>
        <Button asChild variant="primary" size="lg" className="mt-8">
          <a href={addressUrl(env.tokenMint)} target="_blank" rel="noreferrer">
            View on Solana Explorer
            <ArrowUpRight />
          </a>
        </Button>
      </div>
    </Container>
  );
}
