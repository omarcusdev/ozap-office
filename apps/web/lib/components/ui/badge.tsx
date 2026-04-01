import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-semibold font-mono tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-gold/15 text-gold",
        secondary: "border-transparent bg-raised text-sand",
        destructive: "border-transparent bg-coral/15 text-coral",
        outline: "border-edge text-sand",
        sage: "border-transparent bg-sage/15 text-sage",
        ember: "border-transparent bg-ember/15 text-ember",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

type BadgeProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>

const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <div className={cn(badgeVariants({ variant }), className)} {...props} />
)

export { Badge, badgeVariants }
