"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, Role } from "@/lib/auth-context";
import { Shield, BookOpen, GraduationCap, Building2, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [selectedRole, setSelectedRole] = useState<Role>("teacher");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (selectedRole !== "teacher") {
      setError("This role space is coming soon.");
      return;
    }

    const success = login(username, password, selectedRole);
    if (success) {
      router.push("/teacher");
    } else {
      setError("Invalid credentials. Hint: vaanchhit / 123456");
    }
  };

  return (
    <div className="min-h-screen bg-[#09090E] text-[#F4F4F6] flex flex-col justify-center py-12 px-6 lg:px-8 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#7C6EFA]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#4FC3F7]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-max-w-md max-w-lg z-10">
        {/* Brand logo */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#7C6EFA] to-[#4FC3F7] flex items-center justify-center font-bold text-white shadow-lg shadow-[#7C6EFA]/20">
            विव
          </div>
          <span className="font-display font-extrabold text-2xl tracking-tight text-white">
            Vivran <span className="text-[#8B8B99] text-base font-normal">विवरण</span>
          </span>
        </div>

        <h2 className="text-center text-3xl font-extrabold font-display tracking-tight text-white">
          Enter Your Workspace
        </h2>
        <p className="mt-2 text-center text-sm text-[#8B8B99]">
          AI-powered teacher workflow & content creation platform
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg z-10">
        <div className="bg-[#0F0F16]/90 border border-white/10 backdrop-blur-xl py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          
          {/* Header pill */}
          <div className="flex justify-between items-center mb-6">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#8B8B99]">
              Select Space
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#4FC3F7]/10 border border-[#4FC3F7]/20 text-[#4FC3F7]">
              <Shield className="w-3 h-3" /> Secure Auth
            </span>
          </div>

          {/* Role selector cards (3 spaces) */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <button
              type="button"
              onClick={() => setSelectedRole("teacher")}
              className={`p-3 rounded-xl border text-left transition-all ${
                selectedRole === "teacher"
                  ? "bg-[#7C6EFA]/15 border-[#7C6EFA] text-white shadow-md shadow-[#7C6EFA]/10"
                  : "bg-white/5 border-white/10 text-[#8B8B99] hover:border-white/20"
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center mb-2 text-[#7C6EFA]">
                <BookOpen className="w-4 h-4" />
              </div>
              <div className="font-semibold text-sm text-white">Teacher</div>
              <div className="text-[10px] text-emerald-400 font-medium mt-0.5">Active Space</div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedRole("student")}
              className={`p-3 rounded-xl border text-left transition-all opacity-60 ${
                selectedRole === "student"
                  ? "bg-[#7C6EFA]/15 border-[#7C6EFA] text-white"
                  : "bg-white/5 border-white/10 text-[#8B8B99]"
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center mb-2 text-[#4FC3F7]">
                <GraduationCap className="w-4 h-4" />
              </div>
              <div className="font-semibold text-sm text-white">Student</div>
              <div className="text-[10px] text-[#8B8B99] font-medium mt-0.5">Coming Soon</div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedRole("institution")}
              className={`p-3 rounded-xl border text-left transition-all opacity-60 ${
                selectedRole === "institution"
                  ? "bg-[#7C6EFA]/15 border-[#7C6EFA] text-white"
                  : "bg-white/5 border-white/10 text-[#8B8B99]"
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center mb-2 text-purple-400">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="font-semibold text-sm text-white">Institution</div>
              <div className="text-[10px] text-[#8B8B99] font-medium mt-0.5">Coming Soon</div>
            </button>
          </div>

          {/* Form */}
          <form className="space-y-4" onSubmit={handleLoginSubmit}>
            <div>
              <label className="block text-xs font-medium text-[#8B8B99] mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username (e.g. vaanchhit)"
                disabled={selectedRole !== "teacher"}
                className="w-full h-11 px-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#55555F] text-sm focus:outline-none focus:border-[#7C6EFA] transition-colors disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8B8B99] mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password (e.g. 123456)"
                disabled={selectedRole !== "teacher"}
                className="w-full h-11 px-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-[#55555F] text-sm focus:outline-none focus:border-[#7C6EFA] transition-colors disabled:opacity-50"
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {error}
              </div>
            )}

            {/* Hint Box */}
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-[#8B8B99] leading-relaxed">
              🔑 <strong className="text-white">Teacher Beta Access:</strong> Username{" "}
              <code className="text-[#4FC3F7] bg-white/10 px-1.5 py-0.5 rounded">vaanchhit</code>,
              password <code className="text-[#4FC3F7] bg-white/10 px-1.5 py-0.5 rounded">123456</code>.
            </div>

            <button
              type="submit"
              disabled={selectedRole !== "teacher"}
              className="w-full h-11 bg-gradient-to-r from-[#7C6EFA] to-[#4FC3F7] text-white font-medium text-sm rounded-xl shadow-lg shadow-[#7C6EFA]/25 hover:opacity-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Enter Teacher Terminal <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

