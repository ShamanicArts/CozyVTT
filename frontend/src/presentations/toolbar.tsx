import { createContext, useContext, type ReactNode } from "react";

const CampaignPresentationSwitcherContext = createContext<ReactNode>(null);

export function CampaignPresentationSwitcherProvider({
  children,
  switcher,
}: {
  readonly children: ReactNode;
  readonly switcher: ReactNode;
}) {
  return (
    <CampaignPresentationSwitcherContext.Provider value={switcher}>
      {children}
    </CampaignPresentationSwitcherContext.Provider>
  );
}

export function useCampaignPresentationSwitcher(): ReactNode {
  return useContext(CampaignPresentationSwitcherContext);
}
