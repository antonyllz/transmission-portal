import { useEffect, useState } from "react";
import { FloatingDock, type DockImage, type DockItem } from "@/components/ui/floating-dock";
import { HomeIcon, LambdaIcon, LoaIcon, RfoIcon, RmaIcon, WarehouseIcon, WindowIcon } from "@/components/dock-icons";

/* Main navigation of the Transmission Portal. Each `route` is a hash route
   already handled by assets/js/navigation.js (ROUTE_OPENERS).
   Tools get an animated icon; clients get their logo (the same pictures the
   old client cards used), cropped around the mark. */
type NavItem = { title: string; route: string } & ({ Icon: () => React.JSX.Element } | { image: DockImage });

const NAV: NavItem[] = [
  { title: "Home", route: "", Icon: HomeIcon },
  { title: "Almoxarifado", route: "almoxarifado", Icon: WarehouseIcon },
  { title: "Janelas programadas", route: "janelas", Icon: WindowIcon },
  { title: "RMAs", route: "rmas", Icon: RmaIcon },
  { title: "Lambdas", route: "lambdas", Icon: LambdaIcon },
  { title: "Generate LOA", route: "loa", Icon: LoaIcon },
  { title: "Generate RFO", route: "rfo", Icon: RfoIcon },
  {
    title: "Amazon Leo",
    route: "amazon-leo",
    image: { src: "assets/images/amazon-leo-card.jpg", size: "138% auto", position: "47% 47%", feather: true },
  },
  {
    title: "Starlink",
    route: "starlink",
    image: { src: "assets/images/starlink-card.jpg", size: "250% auto", position: "50% 60%" },
  },
];

function currentRoute() {
  return decodeURIComponent(location.hash.replace(/^#\/?/, "")).replace(/\/+$/, "");
}

/* the router uses pushState, which doesn't fire hashchange — so also hook it */
function useRoute() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const update = () => setRoute(currentRoute());
    const { pushState, replaceState } = history;
    history.pushState = function (...args) {
      pushState.apply(this, args);
      update();
    };
    history.replaceState = function (...args) {
      replaceState.apply(this, args);
      update();
    };
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    return () => {
      history.pushState = pushState;
      history.replaceState = replaceState;
      window.removeEventListener("hashchange", update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return route;
}

export function PortalDock() {
  const route = useRoute();
  const items: DockItem[] = NAV.map((n) => ({
    title: n.title,
    href: `#/${n.route}`,
    ...("Icon" in n ? { icon: <n.Icon /> } : { image: n.image }),
    active: n.route === "" ? route === "" : route === n.route || route.startsWith(`${n.route}/`),
  }));

  return (
    <nav
      aria-label="Navegação principal"
      className="pointer-events-none fixed bottom-4 left-4 z-[250] md:bottom-auto md:top-[calc(50vh+26px)] md:-translate-y-1/2"
    >
      <div className="pointer-events-auto">
        <FloatingDock items={items} orientation="vertical" />
      </div>
    </nav>
  );
}
