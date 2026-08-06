import {
  createSystem,
  defaultConfig,
  defineConfig,
  defineRecipe,
} from "@chakra-ui/react";

const transition = {
  transitionProperty:
    "background, border-color, color, box-shadow, transform, opacity",
  transitionDuration: "fast",
  transitionTimingFunction: "out",
};

const buttonRecipe = defineRecipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "2",
    borderRadius: "control",
    fontWeight: "semibold",
    cursor: "pointer",
    ...transition,
    _hover: { transform: "translateY(-1px)" },
    _active: { transform: "scale(.985)" },
    _focusVisible: {
      outline: "2px solid",
      outlineColor: "focus.ring",
      outlineOffset: "2px",
    },
    _disabled: { opacity: 0.48, cursor: "not-allowed", transform: "none" },
  },
  variants: {
    size: {
      sm: { h: "9", px: "3.5", textStyle: "sm" },
      md: { h: "10", px: "4", textStyle: "sm" },
      lg: { h: "11", px: "5", textStyle: "md" },
    },
    variant: {
      solid: {
        bg: "action.primary",
        color: "action.onPrimary",
        _hover: { bg: "action.primaryHover", transform: "translateY(-1px)" },
      },
      surface: {
        bg: "bg.raised",
        color: "fg",
        border: "1px solid",
        borderColor: "border",
        shadow: "xs",
        _hover: { bg: "bg.subtle", borderColor: "border.emphasized" },
      },
      ghost: {
        bg: "transparent",
        color: "fg.muted",
        _hover: { bg: "bg.emphasized", color: "fg" },
      },
    },
  },
  defaultVariants: { size: "md", variant: "solid" },
});

const config = defineConfig({
  globalCss: {
    "html, body": { bg: "bg", color: "fg", fontFamily: "body" },
    "*:focus-visible": { outlineColor: "focus.ring" },
  },
  theme: {
    tokens: {
      fonts: {
        body: { value: '"Satoshi", "Satoshi Variable", "Inter", sans-serif' },
        heading: {
          value: '"Satoshi", "Satoshi Variable", "Inter", sans-serif',
        },
        mono: { value: '"DM Mono", ui-monospace, monospace' },
      },
      radii: {
        control: { value: "8px" },
        panel: { value: "12px" },
      },
      shadows: {
        xs: { value: "0 1px 2px rgba(68,63,63,.05)" },
        sm: { value: "0 2px 8px rgba(68,63,63,.07)" },
        md: { value: "0 10px 28px rgba(68,63,63,.1)" },
        lg: { value: "0 18px 48px rgba(68,63,63,.14)" },
      },
      durations: {
        fast: { value: "180ms" },
        moderate: { value: "240ms" },
        slow: { value: "340ms" },
      },
      easings: { out: { value: "cubic-bezier(.32,.72,0,1)" } },
      colors: {
        brand: {
          orange: { value: "#CF3F02" },
          orangeHover: { value: "#B83800" },
          brown: { value: "#443F3F" },
          bgSubtle: { value: "#F5F3F0" },
          border: { value: "#E8E5E0" },
          textSecondary: { value: "#716B68" },
        },
      },
    },
    semanticTokens: {
      colors: {
        bg: {
          value: "{colors.brand.bgSubtle}",
          subtle: { value: "#FCFBF9" },
          raised: { value: "#FFFFFF" },
          emphasized: { value: "#EFEBE6" },
          muted: { value: "#E5E0DA" },
        },
        fg: {
          value: "{colors.brand.brown}",
          muted: { value: "{colors.brand.textSecondary}" },
          placeholder: { value: "#98918D" },
        },
        border: {
          value: "{colors.brand.border}",
          emphasized: { value: "#CFC9C2" },
        },
        action: {
          primary: { value: "{colors.brand.orange}" },
          primaryHover: { value: "{colors.brand.orangeHover}" },
          onPrimary: { value: "#FFFFFF" },
        },
        focus: {
          ring: { value: "{colors.brand.orange}" },
          subtle: { value: "rgba(207,63,2,.18)" },
        },
        status: {
          success: {
            fg: { value: "#236637" },
            subtle: { value: "#EAF5ED" },
            border: { value: "#B8DCC1" },
          },
          warning: {
            fg: { value: "#79551A" },
            subtle: { value: "#FFF4D8" },
            border: { value: "#E8CE91" },
          },
          danger: {
            fg: { value: "#A12E0A" },
            subtle: { value: "#FFF0EA" },
            border: { value: "#E4B59F" },
            hover: { value: "#842306" },
          },
          info: {
            fg: { value: "#315F75" },
            subtle: { value: "#EAF4F8" },
            border: { value: "#B9D7E4" },
          },
        },
      },
    },
    textStyles: {
      display: {
        value: {
          fontSize: "5xl",
          lineHeight: ".98",
          fontWeight: "600",
          letterSpacing: "-.04em",
        },
      },
      pageTitle: {
        value: {
          fontSize: "3xl",
          lineHeight: "1.1",
          fontWeight: "600",
          letterSpacing: "-.025em",
        },
      },
      sectionTitle: {
        value: { fontSize: "xl", lineHeight: "1.2", fontWeight: "600" },
      },
      cardTitle: {
        value: { fontSize: "md", lineHeight: "1.3", fontWeight: "600" },
      },
      body: { value: { fontSize: "md", lineHeight: "1.6" } },
      label: {
        value: { fontSize: "sm", lineHeight: "1.3", fontWeight: "600" },
      },
      metadata: {
        value: { fontSize: "xs", lineHeight: "1.4", fontWeight: "500" },
      },
    },
    recipes: { button: buttonRecipe },
  },
});

export const system = createSystem(defaultConfig, config);
