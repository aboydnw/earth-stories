import { Spinner } from "@chakra-ui/react";

export function BrandSpinner({
  size = "md",
  label = "Loading",
  decorative = false,
}: {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  label?: string;
  decorative?: boolean;
}) {
  return (
    <Spinner
      size={size}
      color="action.primary"
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : "status"}
      flexShrink={0}
    />
  );
}
