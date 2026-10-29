package com.econectapp.android;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.widget.FrameLayout;
import android.view.WindowInsets;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

/** Internal Android preview; no JavaScript payment bridge or client-side coin crediting. */
public final class MainActivity extends Activity {
    private static final String HOME = "https://econectapp.com/";
    private static final int PICK_FILE = 101, MEDIA_PERMISSION = 102;
    private WebView web;
    private ValueCallback<Uri[]> fileResult;
    private PermissionRequest mediaRequest;
    private String[] requestedResources;

    private boolean trusted(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme()) &&
            ("econectapp.com".equalsIgnoreCase(uri.getHost()) || "www.econectapp.com".equalsIgnoreCase(uri.getHost())) &&
            (uri.getPort() == -1 || uri.getPort() == 443);
    }
    private boolean checkout(Uri uri) {
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(java.util.Locale.ROOT);
        return host.equals("paystack.com") || host.endsWith(".paystack.com") || host.equals("paystack.co") || host.endsWith(".paystack.co");
    }
    private void unavailable() { Toast.makeText(this, "Purchases are not enabled in this Android preview.", Toast.LENGTH_LONG).show(); }
    private WebResourceResponse blockedCheckout() {
        byte[] json = "{\"error\":\"Purchases are not enabled in this Android preview.\",\"code\":\"ANDROID_PAYMENTS_PENDING\"}".getBytes(StandardCharsets.UTF_8);
        HashMap<String,String> headers = new HashMap<>(); headers.put("Cache-Control", "no-store");
        return new WebResourceResponse("application/json", "UTF-8", 503, "Not ready", headers, new ByteArrayInputStream(json));
    }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this); web.setBackgroundColor(Color.WHITE);
        FrameLayout root = new FrameLayout(this); root.addView(web, new FrameLayout.LayoutParams(-1, -1)); setContentView(root);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " eConectPlayPreview/0.1");
        settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (trusted(uri)) return false;
                if (checkout(uri)) { unavailable(); return true; }
                String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(java.util.Locale.ROOT);
                if (scheme.equals("https") || scheme.equals("mailto") || scheme.equals("tel") || scheme.equals("whatsapp")) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { Toast.makeText(MainActivity.this, "No app can open this link.", Toast.LENGTH_SHORT).show(); }
                }
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl(); String path = uri.getPath() == null ? "" : uri.getPath();
                if (checkout(uri) || (trusted(uri) && (path.startsWith("/api/paystack/") || path.equals("/api/payment") || path.equals("/api/payment-sent")))) return blockedCheckout();
                return super.shouldInterceptRequest(view, request);
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) { handler.cancel(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!trusted(Uri.parse(view.getUrl() == null ? "" : view.getUrl()))) { callback.onReceiveValue(null); return true; }
                if (fileResult != null) fileResult.onReceiveValue(null);
                fileResult = callback;
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT); pick.addCategory(Intent.CATEGORY_OPENABLE);
                String[] accepts = params.getAcceptTypes(); List<String> safe = new ArrayList<>();
                for (String type : accepts) if (type.matches("(image|video|audio)/[a-zA-Z0-9.+*_-]+")) safe.add(type);
                pick.setType(safe.size() == 1 ? safe.get(0) : "*/*");
                if (safe.size() > 1) pick.putExtra(Intent.EXTRA_MIME_TYPES, safe.toArray(new String[0]));
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(pick, PICK_FILE); } catch (Exception ignored) { fileResult.onReceiveValue(null); fileResult = null; }
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (!trusted(request.getOrigin()) || !trusted(Uri.parse(web.getUrl() == null ? "" : web.getUrl()))) { request.deny(); return; }
                    if (mediaRequest != null) mediaRequest.deny();
                    List<String> permissions = new ArrayList<>(), resources = new ArrayList<>();
                    for (String resource : request.getResources()) {
                        String permission = resource.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE) ? Manifest.permission.CAMERA : resource.equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE) ? Manifest.permission.RECORD_AUDIO : null;
                        if (permission != null) { resources.add(resource); if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) permissions.add(permission); }
                    }
                    if (resources.isEmpty()) { request.deny(); return; }
                    if (permissions.isEmpty()) { request.grant(resources.toArray(new String[0])); return; }
                    mediaRequest = request; requestedResources = resources.toArray(new String[0]);
                    requestPermissions(permissions.toArray(new String[0]), MEDIA_PERMISSION);
                });
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) { if (request == mediaRequest) mediaRequest = null; }
        });
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::backInsideApp);
        if (saved == null || web.restoreState(saved) == null) web.loadUrl(HOME);
    }
    private void backInsideApp() { if (web.canGoBack()) web.goBack(); }
    @Override public void onBackPressed() { backInsideApp(); }
    @Override protected void onSaveInstanceState(Bundle state) { web.saveState(state); super.onSaveInstanceState(state); }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_FILE || fileResult == null) return;
        List<Uri> files = new ArrayList<>();
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) for (int i = 0; i < data.getClipData().getItemCount(); i++) { Uri uri = data.getClipData().getItemAt(i).getUri(); if ("content".equals(uri.getScheme())) files.add(uri); }
            else if (data.getData() != null && "content".equals(data.getData().getScheme())) files.add(data.getData());
        }
        fileResult.onReceiveValue(files.isEmpty() ? null : files.toArray(new Uri[0])); fileResult = null;
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code != MEDIA_PERMISSION || mediaRequest == null) return;
        List<String> granted = new ArrayList<>();
        if (trusted(Uri.parse(web.getUrl() == null ? "" : web.getUrl()))) for (String resource : requestedResources) {
            String permission = resource.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE) ? Manifest.permission.CAMERA : Manifest.permission.RECORD_AUDIO;
            if (checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) granted.add(resource);
        }
        if (granted.isEmpty()) mediaRequest.deny(); else mediaRequest.grant(granted.toArray(new String[0])); mediaRequest = null;
    }
    @Override protected void onDestroy() { if (fileResult != null) fileResult.onReceiveValue(null); if (mediaRequest != null) mediaRequest.deny(); web.destroy(); super.onDestroy(); }
}
