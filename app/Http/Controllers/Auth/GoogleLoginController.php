<?php

namespace App\Http\Controllers\Auth;

use App\Models\User;
use App\Http\Controllers\Controller;
use App\Providers\RouteServiceProvider;
use Illuminate\Auth\Events\Registered;
use Illuminate\Auth\Events\Verified;
use Illuminate\Support\Facades\Auth;
use Laravel\Socialite\Facades\Socialite;

class GoogleLoginController extends Controller
{
    public function redirect()
    {
        return Socialite::driver("google")->redirect();
    }

    public function callback()
    {
        $googleUser = Socialite::driver("google")->user();

        // Search by Google ID first, so only one Google account is ever linked at a time.
        $user = User::query()
            // Existing user already has linked Google account
            ->where("google_id", $googleUser->getId())
            // Existing user is logging in with Google for the first time
            ->orWhere("email", $googleUser->getEmail())
            ->first();

        $queryParams = "";

        if ($user) {
            $user->update([
                "google_id" => $googleUser->getId(),
                "google_token" => $googleUser->token,
                "google_refresh_token" => $googleUser->refreshToken,
            ]);

            if (!$user->hasVerifiedEmail()) {
                $user->markEmailAsVerified();
                event(new Verified($user));
                // See app\Http\Controllers\Auth\VerifyEmailController.php
                $queryParams = "?verified=1";
            }
        } else {
            $user = User::query()->create([
                "name" => $googleUser->getName(),
                "email" => $googleUser->getEmail(),
                "google_id" => $googleUser->getId(),
                "google_token" => $googleUser->token,
                "google_refresh_token" => $googleUser->refreshToken,
            ]);
            $user->markEmailAsVerified();
            event(new Registered($user));
            event(new Verified($user));
            $queryParams = "?verified=1";
        }

        Auth::login($user, true);

        return redirect()->intended(RouteServiceProvider::HOME . $queryParams);
    }
}
