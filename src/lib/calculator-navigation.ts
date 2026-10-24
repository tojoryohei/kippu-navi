import type { TransitionBeforePreparationEvent } from "astro:transitions/client";

document.addEventListener("astro:before-preparation", (event) => {
  if (!document.querySelector('[data-calculator-hydrated="false"]')) return;

  const navigation = event as TransitionBeforePreparationEvent;
  navigation.preventDefault();
  if (navigation.navigationType === "replace" || navigation.navigationType === "traverse") {
    window.location.replace(navigation.to.href);
  } else {
    window.location.assign(navigation.to.href);
  }
});
