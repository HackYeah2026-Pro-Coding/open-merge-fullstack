import { Hero } from './hero';
import { HowItWorks, LiveNumbers, Roles, TokenCta } from './sections';

export function LandingPage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <TokenCta />
      <Roles />
      <LiveNumbers />
    </>
  );
}
