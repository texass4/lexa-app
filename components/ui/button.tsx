import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-[9px] text-[13px] font-medium tracking-[-0.005em] outline-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:ring-2 focus-visible:ring-gold/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_1px_2px_rgb(0_0_0/0.12)] hover:bg-primary/88",
        secondary:
          "border border-border bg-surface text-foreground shadow-xs hover:border-border-strong hover:bg-surface-muted/60 aria-expanded:bg-surface-muted",
        outline:
          "border border-border bg-surface text-foreground shadow-xs hover:border-border-strong hover:bg-surface-muted/60 aria-expanded:bg-surface-muted",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
        destructive: "border border-danger/20 bg-danger-soft text-danger hover:border-danger/35 hover:bg-danger-soft/70",
        gold: "bg-gold text-white hover:bg-gold-dark",
        link: "h-auto px-0 text-foreground underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 gap-1.5 px-3 text-[12.5px] [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-7 gap-1 rounded-[7px] px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 px-4 text-sm",
        icon: "size-9",
        "icon-sm": "size-8 rounded-[8px]",
        "icon-xs": "size-7 rounded-[7px] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({ className, variant = "default", size = "default", ...props }: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
