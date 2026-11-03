import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group premium-toaster"
      position="top-right"
      visibleToasts={5}
      duration={7000}
      swipeDirections={["right"]}
      toastOptions={{
        classNames: {
          toast:
            "group toast premium-toast",
          description: "premium-toast-description",
          actionButton: "premium-toast-action",
          cancelButton: "premium-toast-cancel",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
