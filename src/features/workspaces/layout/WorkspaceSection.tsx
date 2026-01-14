import { useToggle } from "react-use";
import { Hint } from "@/components/Hint";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ReactNode } from "react";
import { FaCaretDown } from "react-icons/fa";
import { cn } from "@/lib/utils";

interface WorkspaceSectionProps {
  defaultOpen?: boolean;
  children: ReactNode;
  label: string;
  hint: string;
  onNew?: () => void;
  className?: string;
}

export function WorkspaceSection({
  defaultOpen = false,
  children,
  label,
  hint,
  onNew,
  className,
}: WorkspaceSectionProps) {
  const [on, toggle] = useToggle(defaultOpen);
  return (
    <div className="flex flex-col mt-3 px-2">
      <div className="flex items-center px-1.5 group shrink-0">
        <Button
          variant="transparent"
          className="p-0.5 text-sm text-[#f9edffcc] shrink-0 size-6"
          onClick={toggle}
        >
          <FaCaretDown
            className={cn("size-4 transition-transform", !on && "-rotate-90")}
          />
        </Button>
        <Button
          variant="transparent"
          size="sm"
          className="group px-1.5 text-sm text-[#f9edffcc] h-[28px] justify-start items-center overflow-hidden"
        >
          <span className="truncate">{label}</span>
        </Button>
        {onNew && (
          <Hint label={hint} side="top" align="center">
            <Button
              variant="transparent"
              size="icon-sm"
              className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto p-0.5 text-sm text-[#f9edffcc] size-6 shrink-0 cursor-pointer"
              onClick={onNew}
            >
              <Plus className="size-5" />
            </Button>
          </Hint>
        )}
      </div>
      {on && (
        <div className={className}>
          {children}
        </div>
      )}
    </div>
  );
}
