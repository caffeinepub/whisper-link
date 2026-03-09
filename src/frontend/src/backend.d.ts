import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface ChatMessage {
    id: bigint;
    text: string;
    sender: SenderType;
    timestamp: bigint;
}
export interface AdminSettings {
    aiMode: boolean;
    aiVoice: boolean;
}
export interface SignalEntry {
    id: bigint;
    role: string;
    timestamp: bigint;
    payload: string;
}
export interface SessionState {
    adminOnline: boolean;
    visitorOnline: boolean;
}
export interface UserProfile {
    name: string;
}
export enum SenderType {
    ai = "ai",
    admin = "admin",
    visitor = "visitor"
}
export enum UserRole {
    admin = "admin",
    user = "user",
    guest = "guest"
}
export interface backendInterface {
    assignCallerUserRole(user: Principal, role: UserRole): Promise<void>;
    clearSignals(): Promise<void>;
    getAdminSettings(): Promise<AdminSettings>;
    getAllMessages(): Promise<Array<ChatMessage>>;
    getCallerUserProfile(): Promise<UserProfile | null>;
    getCallerUserRole(): Promise<UserRole>;
    getMessages(since: bigint): Promise<Array<ChatMessage>>;
    getSessionState(): Promise<SessionState>;
    getSignals(forRole: string, since: bigint): Promise<Array<SignalEntry>>;
    getUserProfile(user: Principal): Promise<UserProfile | null>;
    isCallerAdmin(): Promise<boolean>;
    postSignal(role: string, payload: string): Promise<bigint>;
    saveCallerUserProfile(profile: UserProfile): Promise<void>;
    sendMessage(text: string, sender: SenderType): Promise<bigint>;
    setAdminOnline(online: boolean): Promise<void>;
    setAdminSettings(aiMode: boolean, aiVoice: boolean): Promise<void>;
    setVisitorOnline(online: boolean): Promise<void>;
    verifyAdminPin(pin: string): Promise<boolean>;
}
