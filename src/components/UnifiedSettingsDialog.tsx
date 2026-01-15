"use client";

import * as React from "react";
import {
  // Bell,
  // Check,
  // Globe,
  // Home,
  // Keyboard,
  // Link,
  // Lock,
  // Menu,
  // MessageCircle,
  // Paintbrush,
  // Settings,
  Video,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSettingsModal } from "@/store/use-settings-modal";
import { AudioVideoSettings } from "@/features/huddle/components/AudioVideoSettings";

type SettingsSection = "audio-video";

interface NavItem {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  section: SettingsSection | null;
}

const navItems: NavItem[] = [
  // { name: "Notifications", icon: Bell, section: null },
  // { name: "Navigation", icon: Menu, section: null },
  // { name: "Home", icon: Home, section: null },
  // { name: "Appearance", icon: Paintbrush, section: null },
  // { name: "Messages & media", icon: MessageCircle, section: null },
  // { name: "Language & region", icon: Globe, section: null },
  // { name: "Accessibility", icon: Keyboard, section: null },
  // { name: "Mark as read", icon: Check, section: null },
  { name: "Audio & video", icon: Video, section: "audio-video" },
  // { name: "Connected accounts", icon: Link, section: null },
  // { name: "Privacy & visibility", icon: Lock, section: null },
  // { name: "Advanced", icon: Settings, section: null },
];

/**
 * Unified Settings Dialog
 *
 * Single settings dialog with sidebar navigation
 * Includes Audio & video section for huddle settings
 */
export function UnifiedSettingsDialog() {
  const [open, setOpen, , initialSection] = useSettingsModal();
  const [activeSection, setActiveSection] =
    React.useState<SettingsSection | null>(initialSection || "audio-video");

  // Update active section when initial section changes or dialog opens
  React.useEffect(() => {
    if (open && initialSection) {
      setActiveSection(initialSection);
    } else if (open && !initialSection) {
      // Default to audio-video if no section specified
      setActiveSection("audio-video");
    }
  }, [open, initialSection]);

  const renderContent = () => {
    switch (activeSection) {
      case "audio-video":
        return <AudioVideoSettings />;
      default:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {navItems.find((item) => item.section === activeSection)?.name ||
                "Select a setting from the sidebar"}
            </p>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 md:max-h-[700px] md:max-w-[700px] lg:max-w-[800px]">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Customize your settings here.
        </DialogDescription>
        <div className="flex h-[600px]">
          <SidebarProvider className="flex flex-1 items-start">
            <Sidebar collapsible="none" className="hidden md:flex">
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {navItems.map((item) => (
                        <SidebarMenuItem key={item.name}>
                          <SidebarMenuButton
                            isActive={item.section === activeSection}
                            onClick={() =>
                              item.section && setActiveSection(item.section)
                            }
                          >
                            <item.icon />
                            <span>{item.name}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>
            <main className="flex flex-1 flex-col h-full">
              <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border transition-[width,height] ease-linear">
                <div className="flex items-center gap-2 px-4">
                  <h2 className="text-lg font-semibold">
                    {navItems.find((item) => item.section === activeSection)
                      ?.name || "Settings"}
                  </h2>
                </div>
              </header>
              <ScrollArea className="h-[calc(600px-4rem)]">
                <div className="flex flex-col gap-4 px-6 py-4">
                  {renderContent()}
                </div>
              </ScrollArea>
            </main>
          </SidebarProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}
