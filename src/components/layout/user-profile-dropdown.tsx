"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { User, Settings, LogOut, Moon, Sun, Monitor, ChevronDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuGroup, DropdownMenuSub,
  DropdownMenuSubTrigger, DropdownMenuSubContent,DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from "@/stores/auth.store";
import { useUIStore } from "@/stores/ui.store";
import { getInitials } from "@/lib/utils";
import { ROUTES } from "@/config/routes";

export function UserProfileDropdown() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useUIStore();

  const name  = user?.name  ?? "User";
  const email = user?.email ?? "";

  function handleLogout() { logout(); router.push(ROUTES.LOGIN); }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar className="h-7 w-7">
            <AvatarImage src={user?.avatarUrl} />
            <AvatarFallback className="text-xs">{getInitials(name)}</AvatarFallback>
          </Avatar>
          <div className="hidden md:block min-w-0">
            <p className="truncate text-sm font-medium leading-none">{name}</p>
          </div>
          <ChevronDown className="hidden md:block h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold text-foreground">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push(ROUTES.PROFILE)}>
            <User /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(ROUTES.SETTINGS)}>
            <Settings /> Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === "dark" ? <Moon className="mr-2 h-4 w-4" /> : theme === "light" ? <Sun className="mr-2 h-4 w-4" /> : <Monitor className="mr-2 h-4 w-4" />}
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => setTheme("light")}><Sun className="mr-2 h-4 w-4" /> Light</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}><Moon className="mr-2 h-4 w-4" /> Dark</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}><Monitor className="mr-2 h-4 w-4" /> System</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleLogout} className="text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-950/30">
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
