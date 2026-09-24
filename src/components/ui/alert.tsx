import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

const alertVariants = cva("rounded-lg border px-4 py-3 text-sm", {
  variants: {
    variant: {
      danger: "border-danger/20 bg-danger-soft text-danger",
      warning: "border-warning/20 bg-warning-soft text-warning",
      success: "border-success/20 bg-success-soft text-success",
    },
  },
  defaultVariants: { variant: "danger" },
});

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

function Alert({ className, variant, ...props }: AlertProps) {
  return <div role="alert" className={cn(alertVariants({ variant, className }))} {...props} />;
}

export { Alert };
