import {
  cloneElement,
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Field } from "@chakra-ui/react";

type FieldControl = ReactElement<{
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}>;

export function FormField({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: FieldControl;
}) {
  const generatedId = useId();
  const controlId = children.props.id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  return (
    <Field.Root required={required} invalid={Boolean(error)}>
      <Field.Label htmlFor={controlId}>{label}</Field.Label>
      {cloneElement(children, {
        id: controlId,
        "aria-invalid": Boolean(error) || undefined,
        "aria-describedby":
          [hintId, errorId].filter(Boolean).join(" ") || undefined,
      })}
      {hint ? <Field.HelperText id={hintId}>{hint}</Field.HelperText> : null}
      {error ? <Field.ErrorText id={errorId}>{error}</Field.ErrorText> : null}
    </Field.Root>
  );
}

export const TextInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function TextInput(props, ref) {
  return (
    <input
      {...props}
      ref={ref}
      className={join("es-control", props.className)}
    />
  );
});

export const NumberInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type">
>(function NumberInput(props, ref) {
  return <TextInput {...props} ref={ref} type="number" />;
});

export const SelectInput = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function SelectInput(props, ref) {
  return (
    <select
      {...props}
      ref={ref}
      className={join("es-control", props.className)}
    />
  );
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea(props, ref) {
  return (
    <textarea
      {...props}
      ref={ref}
      className={join("es-control", props.className)}
    />
  );
});

export const FileInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type">
>(function FileInput(props, ref) {
  return <TextInput {...props} ref={ref} type="file" />;
});

export function CheckboxField({
  label,
  hint,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  hint?: ReactNode;
}) {
  const id = props.id ?? useId();
  return (
    <label className="es-checkbox" htmlFor={id}>
      <input {...props} id={id} type="checkbox" />
      <span>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
    </label>
  );
}

function join(base: string, value?: string) {
  return value ? `${base} ${value}` : base;
}
