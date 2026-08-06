import type { PropsWithChildren, ReactNode } from "react";
import { Button, Dialog, Portal } from "@chakra-ui/react";
import { X } from "@phosphor-icons/react";

export function PanelShell({
  open,
  title,
  eyebrow,
  onOpenChange,
  children,
  footer,
}: PropsWithChildren<{
  open: boolean;
  title: string;
  eyebrow?: string;
  onOpenChange: (open: boolean) => void;
  footer?: ReactNode;
}>) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => onOpenChange(details.open)}
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop bg="overlay" />
        <Dialog.Positioner>
          <Dialog.Content
            bg="bg.raised"
            borderRadius="panel"
            shadow="lg"
            maxW="720px"
          >
            <Dialog.Header>
              <div>
                {eyebrow ? <small>{eyebrow}</small> : null}
                <Dialog.Title>{title}</Dialog.Title>
              </div>
              <Dialog.CloseTrigger asChild>
                <Button variant="ghost" aria-label="Close panel">
                  <X />
                </Button>
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body>{children}</Dialog.Body>
            {footer ? <Dialog.Footer>{footer}</Dialog.Footer> : null}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
