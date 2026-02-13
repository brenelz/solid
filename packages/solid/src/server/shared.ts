import { getOwner, getNextChildId } from "@solidjs/signals";

type SSRTemplateObject = { t: string[]; h: Function[]; p: Promise<any>[] };

export type HydrationContext = {
  id: string;
  count: number;
  serialize: (id: string, v: Promise<any> | any, deferStream?: boolean) => void;
  resolve(value: any): SSRTemplateObject;
  ssr(template: string[], ...values: any[]): SSRTemplateObject;
  escape(value: any): string;
  replace: (id: string, replacement: () => any) => void;
  block: (p: Promise<any>) => void;
  registerFragment: (v: string) => (v?: string, err?: any) => boolean;
  async?: boolean;
  noHydrate: boolean;
};

type SharedConfig = {
  context?: HydrationContext;
  getNextContextId(): string;
};

export const sharedConfig: SharedConfig = {
  getNextContextId() {
    const o = getOwner();
    if (!o) throw new Error(`getNextContextId cannot be used under non-hydrating context`);
    return getNextChildId(o);
  }
};
