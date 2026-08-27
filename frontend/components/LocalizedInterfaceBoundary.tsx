"use client";

import { useEffect, type ReactNode } from "react";
import {
  translateInterfaceText,
  type AppLocale,
} from "@/lib/i18n/interface-text";

const attributes = ["placeholder", "title", "aria-label", "alt"] as const;
const sourceText = new WeakMap<Text, string>();
const sourceAttributes = new WeakMap<Element, Map<string, string>>();

function excluded(element: Element | null) {
  return Boolean(
    element?.closest(
      "[data-i18n-exempt],script,style,code,pre,[contenteditable='true']",
    ),
  );
}

function localizeText(node: Text, locale: AppLocale) {
  if (excluded(node.parentElement)) return;
  const previous = sourceText.get(node);
  if (previous === undefined) sourceText.set(node, node.data);
  node.data = translateInterfaceText(previous ?? node.data, locale);
}

function localizeElement(element: Element, locale: AppLocale) {
  if (excluded(element)) return;
  let originals = sourceAttributes.get(element);
  if (!originals) {
    originals = new Map();
    sourceAttributes.set(element, originals);
  }
  for (const attribute of attributes) {
    if (!element.hasAttribute(attribute)) continue;
    if (!originals.has(attribute)) {
      originals.set(attribute, element.getAttribute(attribute) ?? "");
    }
    element.setAttribute(
      attribute,
      translateInterfaceText(originals.get(attribute) ?? "", locale),
    );
  }
}

function localizeTree(root: Node, locale: AppLocale) {
  if (root.nodeType === Node.TEXT_NODE) localizeText(root as Text, locale);
  if (root.nodeType === Node.ELEMENT_NODE)
    localizeElement(root as Element, locale);
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) localizeText(node as Text, locale);
    else localizeElement(node as Element, locale);
    node = walker.nextNode();
  }
}

export function LocalizedInterfaceBoundary({
  children,
  locale,
}: {
  children: ReactNode;
  locale: AppLocale;
}) {
  useEffect(() => {
    const root = document.body;
    localizeTree(root, locale);
    const observer = new MutationObserver((mutations) => {
      observer.disconnect();
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          sourceText.set(mutation.target as Text, (mutation.target as Text).data);
          localizeText(mutation.target as Text, locale);
        }
        if (mutation.type === "attributes") {
          sourceAttributes.delete(mutation.target as Element);
          localizeElement(mutation.target as Element, locale);
        }
        for (const node of mutation.addedNodes) localizeTree(node, locale);
      }
      observer.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [...attributes],
      });
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...attributes],
    });
    return () => observer.disconnect();
  }, [locale]);

  return children;
}
