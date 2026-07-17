import { createContext, createRef, createVNode, ErrorContext, type Child, type Component, type RefBinding } from "@exact/core";

export type FieldValue = string | string[] | boolean | FileList | null;
export type FieldValidationResult = string | boolean | void;
export type FieldValidator = (value: FieldValue, context: FieldValidationContext) => FieldValidationResult | Promise<FieldValidationResult>;
export type FieldValidationContext = { name: string; control?: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; signal: AbortSignal };

export type FieldContextValue = {
  name: string;
  id: string;
  required: boolean;
  error?: string;
  touched: boolean;
  validating: boolean;
  helpId?: string;
  readonly helpIds: readonly string[];
  errorId: string;
  control?: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  attach(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void;
  detach(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void;
  validate(reveal?: boolean): Promise<boolean>;
  registerHelp(id: string): void;
  unregisterHelp(id: string): void;
  nextHelpId(): string;
  input(): Promise<boolean> | undefined;
  blur(): Promise<boolean>;
};

export type FormContextValue = {
  register(field: FieldContextValue): boolean;
  unregister(field: FieldContextValue): void;
  validate(): Promise<boolean>;
};

export const FormContext = createContext<FormContextValue>("exact.form", true);
export const FieldContext = createContext<FieldContextValue>("exact.field", true);
const ControlRef = createRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("exact.field.control");

type FormState = { submitting: boolean };
export type FormProps = Record<string, unknown> & {
  children?: Child | Child[];
  onSubmit?(event: SubmitEvent): unknown;
  onValidSubmit?(event: SubmitEvent, data: FormData): unknown;
  onInvalidSubmit?(event: SubmitEvent): unknown;
};

export function Form(this: Component<FormState>, props: FormProps) {
  this.state.submitting = false;
  const fields = new Set<FieldContextValue>();
  const errors = this.getContext(ErrorContext);
  const context: FormContextValue = {
    register(field) {
      const duplicate = [...fields].find(existing => existing.id === field.id);
      if (duplicate) {
        errors.report(new Error(`Field id "${field.id}" is already registered; repeated field names require explicit distinct ids`), {
          source: "construct",
          phase: "field-registration"
        });
        return false;
      }
      fields.add(field);
      return true;
    },
    unregister: field => fields.delete(field),
    async validate() {
      const results = await Promise.all([...fields].map(field => field.validate(true)));
      return results.every(Boolean);
    }
  };
  this.setContext(FormContext, context);
  const submit = async (event: SubmitEvent) => {
    const userResult = props.onSubmit?.(event);
    const cancelled = event.defaultPrevented;
    event.preventDefault();
    await userResult;
    if (cancelled) return;
    if (this.state.submitting) return;
    this.state.submitting = true;
    try {
      const valid = await context.validate();
      if (!valid) {
        [...fields].find(field => !!field.error)?.control?.focus();
        await props.onInvalidSubmit?.(event);
        return;
      }
      const form = event.target as HTMLFormElement;
      await props.onValidSubmit?.(event, new form.ownerDocument.defaultView!.FormData(form));
    } finally {
      this.state.submitting = false;
    }
  };
  return () => {
    const { children, onSubmit: _submit, onValidSubmit: _valid, onInvalidSubmit: _invalid, ...rest } = props;
    return createVNode("form", { ...rest, noValidate: props.noValidate ?? true, onSubmit: submit, "aria-busy": this.state.submitting || undefined }, ...childrenArray(children));
  };
}

type FieldState = { error?: string; touched: boolean; validating: boolean; helpIds: string[] };
export type FieldProps = {
  name: string;
  id?: string;
  required?: boolean;
  validate?: FieldValidator;
  children?: Child | Child[];
};

export function Field(this: Component<FieldState>, props: FieldProps) {
  this.state.error = undefined;
  this.state.touched = false;
  this.state.validating = false;
  this.state.helpIds = [];
  let generation = 0;
  let nextHelpIndex = 0;
  let controller: AbortController | undefined;
  let form: FormContextValue | undefined;
  const owner = this;
  try { form = this.getContext(FormContext) as FormContextValue; } catch {}
  const id = props.id ?? `exact-field-${sanitizeId(props.name)}`;
  const context: FieldContextValue = {
    name: props.name,
    id,
    get required() { return props.required ?? false; },
    get error() { return owner.state.error; },
    get touched() { return owner.state.touched; },
    get validating() { return owner.state.validating; },
    get helpId() { return owner.state.helpIds[0]; },
    get helpIds() { return owner.state.helpIds; },
    errorId: `${id}-error`,
    attach(control) {
      context.control = control;
      setDescribedBy(control, mergeIds(control.getAttribute("aria-describedby"), ...context.helpIds));
    },
    detach(control) { if (context.control === control) context.control = undefined; },
    registerHelp(helpId) {
      if (!owner.state.helpIds.includes(helpId)) {
        owner.state.helpIds = [...owner.state.helpIds, helpId];
        if (context.control) setDescribedBy(context.control, mergeIds(context.control.getAttribute("aria-describedby"), helpId));
      }
    },
    unregisterHelp(helpId) {
      owner.state.helpIds = owner.state.helpIds.filter(id => id !== helpId);
      if (context.control) setDescribedBy(context.control, withoutId(context.control.getAttribute("aria-describedby"), helpId));
    },
    nextHelpId() { const index = ++nextHelpIndex; return index === 1 ? `${id}-help` : `${id}-help-${index}`; },
    async validate(reveal = false) {
      if (reveal) thisState("touched", true);
      const current = ++generation;
      controller?.abort("superseded");
      controller = new AbortController();
      thisState("validating", true);
      let error = nativeError(context.control);
      if (!error && props.validate) {
        try {
          const result = await props.validate(controlValue(context.control), { name: props.name, control: context.control, signal: controller.signal });
          if (result === false) error = "Invalid value";
          else if (typeof result === "string") error = result;
        } catch (cause) {
          if (!controller.signal.aborted) error = cause instanceof Error ? cause.message : String(cause);
        }
      }
      if (current !== generation) return !context.error;
      thisState("error", error);
      thisState("validating", false);
      return !error;
    },
    input() { return context.touched && context.error ? context.validate(false) : undefined; },
    blur() { thisState("touched", true); return context.validate(true); }
  };
  const thisState = <K extends keyof FieldState>(key: K, value: FieldState[K]) => { this.state[key] = value; };
  const registered = form?.register(context) ?? true;
  if (registered) this.setContext(FieldContext, context);
  this.onUnmount(() => { generation++; controller?.abort("unmounted"); if (registered) form?.unregister(context); });
  return () => registered ? props.children : null;
}

export type LabelProps = Record<string, unknown> & { children?: Child | Child[] };
export function Label(this: Component<{}>, props: LabelProps) {
  const field = this.getContext(FieldContext);
  return () => { const { children, ...rest } = props; return createVNode("label", { ...rest, htmlFor: field.id }, ...childrenArray(children)); };
}

export type ControlProps = Record<string, unknown> & {
  id?: string;
  name?: string;
  required?: boolean;
  ref?: RefBinding<any>;
  onInput?: (event: InputEvent) => unknown;
  onBlur?: (event: FocusEvent) => unknown;
  children?: Child | Child[];
};

export type InputProps = ControlProps;
export type TextareaProps = ControlProps;
export type SelectProps = ControlProps;
export type CheckboxProps = ControlProps;
export function Input(this: Component<{}>, props: InputProps) { return controlComponent.call(this, "input", props); }
export function Textarea(this: Component<{}>, props: TextareaProps) { return controlComponent.call(this, "textarea", props); }
export function Select(this: Component<{}>, props: SelectProps) { return controlComponent.call(this, "select", props); }
export function Checkbox(this: Component<{}>, props: CheckboxProps) { return controlComponent.call(this, "input", { ...props, type: "checkbox" }); }

function controlComponent(this: Component<{}>, tag: "input" | "textarea" | "select", props: ControlProps) {
  const field = this.getContext(FieldContext);
  const binding = this.ref(ControlRef);
  const combined = {
    fulfill(value: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | undefined) {
      binding.fulfill(value); props.ref?.fulfill(value);
    }
  };
  this.onMount(() => { const control = this.refs.get(ControlRef); if (control) field.attach(control); });
  this.onUnmount(() => { const control = this.refs.get(ControlRef); if (control) field.detach(control); });
  const input = (event: InputEvent) => combineAsync(props.onInput?.(event), field.input());
  const blur = (event: FocusEvent) => combineAsync(props.onBlur?.(event), field.blur());
  return () => {
    const { children, ref: _ref, onInput: _input, onBlur: _blur, ...rest } = props;
    const describedBy = mergeIds(
      props["aria-describedby"],
      ...field.helpIds,
      field.touched && field.error ? field.errorId : undefined
    );
    const invalid = field.touched && !!field.error ? true : props["aria-invalid"];
    return createVNode(tag, {
      ...rest,
      id: props.id ?? field.id,
      name: props.name ?? field.name,
      required: props.required ?? field.required,
      "aria-describedby": describedBy,
      "aria-invalid": invalid,
      ref: combined,
      onInput: input,
      onBlur: blur
    }, ...childrenArray(children));
  };
}

export type FieldHelpProps = Record<string, unknown> & { children?: Child | Child[] };
export function FieldHelp(this: Component<{}>, props: FieldHelpProps) {
  const field = this.getContext(FieldContext);
  const helpId = typeof props.id === "string" ? props.id : field.nextHelpId();
  this.onMount(() => field.registerHelp(helpId));
  this.onUnmount(() => field.unregisterHelp(helpId));
  return () => { const { children, ...rest } = props; return createVNode("span", { ...rest, id: helpId }, ...childrenArray(children)); };
}

export type FieldErrorProps = Record<string, unknown>;
export function FieldError(this: Component<{}>, props: FieldErrorProps) {
  const field = this.getContext(FieldContext);
  return () => field.touched && field.error ? createVNode("span", { ...props, id: field.errorId, role: "alert" }, field.error) : null;
}

function childrenArray(children: Child | Child[] | undefined): Child[] { return Array.isArray(children) ? children : children === undefined ? [] : [children]; }
function mergeIds(...values: unknown[]): string | undefined {
  const ids = values.flatMap(value => typeof value === "string" ? value.split(/\s+/) : []).filter(Boolean);
  return ids.length ? [...new Set(ids)].join(" ") : undefined;
}
function withoutId(value: string | null, removed: string): string | undefined {
  return mergeIds(value?.split(/\s+/).filter(id => id !== removed).join(" "));
}
function setDescribedBy(control: Element, value: string | undefined): void {
  if (value) control.setAttribute("aria-describedby", value);
  else control.removeAttribute("aria-describedby");
}
function combineAsync(...values: unknown[]): Promise<unknown> | undefined {
  const promises = values.filter(isPromiseLike).map(value => Promise.resolve(value));
  return promises.length ? Promise.all(promises) : undefined;
}
function isPromiseLike(value: unknown): value is PromiseLike<unknown> { return !!value && (typeof value === "object" || typeof value === "function") && typeof (value as PromiseLike<unknown>).then === "function"; }
function sanitizeId(value: string): string { return value.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "field"; }
function nativeError(control?: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string | undefined { return control && !control.validity.valid ? control.validationMessage || "Invalid value" : undefined; }
function controlValue(control?: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): FieldValue {
  if (!control) return null;
  if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) return control.checked;
  if (control instanceof HTMLInputElement && control.type === "file") return control.files;
  if (control instanceof HTMLSelectElement && control.multiple) return Array.from(control.selectedOptions, option => option.value);
  return control.value;
}
