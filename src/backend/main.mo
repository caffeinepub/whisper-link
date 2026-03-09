import Runtime "mo:core/Runtime";
import List "mo:core/List";
import Text "mo:core/Text";
import Iter "mo:core/Iter";
import Order "mo:core/Order";
import Nat "mo:core/Nat";
import Time "mo:core/Time";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import AccessControl "authorization/access-control";
import MixinAuthorization "authorization/MixinAuthorization";

actor {
  // Initialize access control
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);

  // User Profile Type
  public type UserProfile = {
    name : Text;
  };

  let userProfiles = Map.empty<Principal, UserProfile>();

  public query ({ caller }) func getCallerUserProfile() : async ?UserProfile {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can access profiles");
    };
    userProfiles.get(caller);
  };

  public query ({ caller }) func getUserProfile(user : Principal) : async ?UserProfile {
    if (caller != user and not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Can only view your own profile");
    };
    userProfiles.get(user);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : UserProfile) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only users can save profiles");
    };
    userProfiles.add(caller, profile);
  };

  // Chat Message Types
  type ChatMessage = {
    id : Nat;
    text : Text;
    sender : SenderType;
    timestamp : Int;
  };

  type SenderType = {
    #visitor;
    #admin;
    #ai;
  };

  module ChatMessage {
    public func compareByTimestamp(a : ChatMessage, b : ChatMessage) : Order.Order {
      Int.compare(a.timestamp, b.timestamp);
    };
  };

  type SignalEntry = {
    id : Nat;
    role : Text;
    payload : Text;
    timestamp : Int;
  };

  module SignalEntry {
    public func compare(s1 : SignalEntry, s2 : SignalEntry) : Order.Order {
      Nat.compare(s1.id, s2.id);
    };
  };

  type SessionState = {
    visitorOnline : Bool;
    adminOnline : Bool;
  };

  type AdminSettings = {
    aiMode : Bool;
    aiVoice : Bool;
  };

  // State
  var messageIdCounter = 0;
  var signalIdCounter = 0;
  var visitorOnline = false;
  var adminOnline = false;

  var adminSettings = {
    aiMode = false;
    aiVoice = false;
  };

  let chatMessages = List.empty<ChatMessage>();
  let signalEntries = List.empty<SignalEntry>();

  // Chat Functions - accessible to both admin and user (visitor)
  public shared ({ caller }) func sendMessage(text : Text, sender : SenderType) : async Nat {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can send messages");
    };

    let id = messageIdCounter;
    messageIdCounter += 1;

    let message : ChatMessage = {
      id;
      text;
      sender;
      timestamp = Time.now();
    };

    chatMessages.add(message);
    id;
  };

  public query ({ caller }) func getMessages(since : Int) : async [ChatMessage] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can read messages");
    };
    chatMessages.reverse().values().takeWhile(func(m) { m.timestamp > since }).toArray();
  };

  public query ({ caller }) func getAllMessages() : async [ChatMessage] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can read messages");
    };
    chatMessages.reverse().toArray();
  };

  // Admin Settings Functions
  public shared ({ caller }) func setAdminSettings(aiMode : Bool, aiVoice : Bool) : async () {
    if (not (AccessControl.isAdmin(accessControlState, caller))) {
      Runtime.trap("Unauthorized: Only admins can modify settings");
    };
    adminSettings := {
      aiMode;
      aiVoice;
    };
  };

  public query ({ caller }) func getAdminSettings() : async AdminSettings {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can read settings");
    };
    adminSettings;
  };

  // Admin PIN verification - public for authentication, assigns admin role on success
  public shared ({ caller }) func verifyAdminPin(pin : Text) : async Bool {
    let isValid = pin == "admin2024";
    if (isValid) {
      // Assign admin role to caller upon successful PIN verification
      AccessControl.assignRole(accessControlState, caller, caller, #admin);
    };
    isValid;
  };

  // WebRTC Signaling Functions - accessible to both admin and user
  public shared ({ caller }) func postSignal(role : Text, payload : Text) : async Nat {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can post signals");
    };

    let id = signalIdCounter;
    signalIdCounter += 1;

    let signal : SignalEntry = {
      id;
      role;
      payload;
      timestamp = Time.now();
    };

    signalEntries.add(signal);
    id;
  };

  public query ({ caller }) func getSignals(forRole : Text, since : Int) : async [SignalEntry] {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can read signals");
    };
    signalEntries.values().reverse().filter(func(s) { s.role != forRole and s.timestamp > since }).toArray();
  };

  public shared ({ caller }) func clearSignals() : async () {
    if (not (AccessControl.isAdmin(accessControlState, caller))) {
      Runtime.trap("Unauthorized: Only admins can clear signals");
    };
    signalEntries.clear();
  };

  // Session State Functions - users can set their own status
  public shared ({ caller }) func setVisitorOnline(online : Bool) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can set online status");
    };
    visitorOnline := online;
  };

  public shared ({ caller }) func setAdminOnline(online : Bool) : async () {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can set online status");
    };
    adminOnline := online;
  };

  public query ({ caller }) func getSessionState() : async SessionState {
    if (not (AccessControl.hasPermission(accessControlState, caller, #user))) {
      Runtime.trap("Unauthorized: Only authenticated users can read session state");
    };
    { visitorOnline; adminOnline };
  };
};
