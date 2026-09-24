import { cn } from "@/lib/utils/cn";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-black/[0.06] dark:bg-white/[0.08]", className)}
      {...props}
    />
  );
}

export { Skeleton };
