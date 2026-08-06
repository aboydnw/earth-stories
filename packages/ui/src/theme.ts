import {
  createSystem,
  defaultConfig,
  defineConfig,
  defineRecipe,
} from "@chakra-ui/react";
import { productCssVariables, productTokens } from "./tokens.js";

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
    ":root": productCssVariables,
    "html, body": { bg: "bg", color: "fg", fontFamily: "body" },
    "*:focus-visible": { outlineColor: "focus.ring" },
  },
  theme: {
    tokens: {
      fonts: {
        body: { value: productTokens.fonts.body },
        heading: {
          value: productTokens.fonts.body,
        },
        mono: { value: productTokens.fonts.mono },
      },
      radii: {
        control: { value: productTokens.radii.control },
        panel: { value: productTokens.radii.panel },
      },
      shadows: {
        xs: { value: productTokens.shadows.xs },
        sm: { value: productTokens.shadows.sm },
        md: { value: productTokens.shadows.md },
        lg: { value: productTokens.shadows.lg },
      },
      durations: {
        fast: { value: productTokens.motion.fast },
        moderate: { value: productTokens.motion.moderate },
        slow: { value: productTokens.motion.slow },
      },
      easings: { out: { value: productTokens.motion.easing } },
      zIndex: Object.fromEntries(
        Object.entries(productTokens.zIndex).map(([name, value]) => [
          name,
          { value },
        ]),
      ),
      colors: {
        brand: {
          orange: { value: productTokens.colors.action },
          orangeHover: { value: productTokens.colors.actionHover },
          brown: { value: productTokens.colors.text },
          bgSubtle: { value: productTokens.colors.canvas },
          border: { value: productTokens.colors.border },
          textSecondary: { value: productTokens.colors.textMuted },
        },
      },
    },
    semanticTokens: {
      colors: {
        bg: {
          value: "{colors.brand.bgSubtle}",
          subtle: { value: productTokens.colors.subtle },
          raised: { value: productTokens.colors.raised },
          emphasized: { value: productTokens.colors.emphasized },
          muted: { value: productTokens.colors.mutedSurface },
        },
        fg: {
          value: "{colors.brand.brown}",
          muted: { value: "{colors.brand.textSecondary}" },
          placeholder: { value: productTokens.colors.textPlaceholder },
          disabled: { value: productTokens.colors.textDisabled },
        },
        border: {
          value: "{colors.brand.border}",
          emphasized: { value: productTokens.colors.borderEmphasized },
        },
        action: {
          primary: { value: "{colors.brand.orange}" },
          primaryHover: { value: "{colors.brand.orangeHover}" },
          onPrimary: { value: productTokens.colors.raised },
        },
        selection: { value: productTokens.colors.selection },
        overlay: { value: productTokens.colors.overlay },
        disabled: { value: productTokens.colors.disabled },
        map: {
          chrome: { value: productTokens.colors.mapChrome },
        },
        focus: {
          ring: { value: "{colors.brand.orange}" },
          subtle: { value: productTokens.colors.focusSubtle },
        },
        status: {
          success: {
            fg: { value: productTokens.colors.success },
            subtle: { value: productTokens.colors.successBg },
            border: { value: productTokens.colors.successBorder },
          },
          warning: {
            fg: { value: productTokens.colors.warning },
            subtle: { value: productTokens.colors.warningBg },
            border: { value: productTokens.colors.warningBorder },
          },
          danger: {
            fg: { value: productTokens.colors.danger },
            subtle: { value: productTokens.colors.dangerBg },
            border: { value: productTokens.colors.dangerBorder },
            hover: { value: productTokens.colors.dangerHover },
          },
          info: {
            fg: { value: productTokens.colors.info },
            subtle: { value: productTokens.colors.infoBg },
            border: { value: productTokens.colors.infoBorder },
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
