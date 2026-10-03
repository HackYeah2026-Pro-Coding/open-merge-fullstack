import { Hero } from './hero';
import { HowItWorks, LiveNumbers, Roles, TrustStatement } from './sections';

export function LandingPage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <TrustStatement />
      <Roles />
      <LiveNumbers />
    </>
  );
}
