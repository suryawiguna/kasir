import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Gabung class Tailwind; class belakang menang bila bertabrakan (pola Haoshii). */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
