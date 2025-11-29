package com.example.hybridchat

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    companion object {
        // ⚠️ 模拟器访问电脑本机：10.0.2.2
        private const val CHAT_URL = "http://10.0.2.2:3000/index.html"
        // 真机调试（同一 WiFi）：改成你电脑局域网 IP
        // private const val CHAT_URL = "http://192.168.1.100:3000/index.html"

        private const val REQ_CAMERA_MIC = 1001
        private const val REQ_NOTIFICATION = 1002
        private const val REQ_FILE_CHOOSER = 2001

        const val NOTIFICATION_CHANNEL_ID = "chat_channel"
    }

    private lateinit var webView: WebView

    // WebView 文件选择回调
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        createNotificationChannel()

        webView = findViewById(R.id.webView)
        setupWebView()
        webView.loadUrl(CHAT_URL)
    }

    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.loadsImagesAutomatically = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.allowFileAccess = true
        settings.allowContentAccess = true

        webView.webViewClient = object : WebViewClient() {}

        webView.webChromeClient = object : WebChromeClient() {

            // 处理 <input type="file">，弹出系统文件选择器
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                // 先清掉旧的 callback
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                val intent = try {
                    fileChooserParams?.createIntent()
                } catch (e: Exception) {
                    null
                }

                if (intent == null) {
                    this@MainActivity.filePathCallback = null
                    Toast.makeText(
                        this@MainActivity,
                        "无法打开文件选择器",
                        Toast.LENGTH_SHORT
                    ).show()
                    return false
                }

                try {
                    startActivityForResult(intent, REQ_FILE_CHOOSER)
                } catch (e: ActivityNotFoundException) {
                    this@MainActivity.filePathCallback = null
                    Toast.makeText(
                        this@MainActivity,
                        "未找到可用的文件管理器",
                        Toast.LENGTH_SHORT
                    ).show()
                    return false
                }

                return true
            }

            // H5 申请相机 / 麦克风权限（WebRTC）
            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request == null) return
                runOnUiThread {
                    val resources = mutableListOf<String>()
                    if (ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.CAMERA
                        ) == PackageManager.PERMISSION_GRANTED
                    ) {
                        resources.add(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                    }
                    if (ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.RECORD_AUDIO
                        ) == PackageManager.PERMISSION_GRANTED
                    ) {
                        resources.add(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    }
                    if (resources.isNotEmpty()) {
                        request.grant(resources.toTypedArray())
                    } else {
                        request.deny()
                    }
                }
            }
        }

        // JS 与原生交互桥
        webView.addJavascriptInterface(WebAppInterface(this), "AndroidNative")
    }

    // ===== 处理文件选择结果 =====
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == REQ_FILE_CHOOSER) {
            val result = WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            filePathCallback?.onReceiveValue(result)
            filePathCallback = null
        }
    }

    // ===== 以下是给 JSBridge 调用的工具方法（之前就有的） =====

    // 申请相机+麦克风权限
    fun requestCameraAndMicPermissionsFromJs() {
        val need = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            need.add(Manifest.permission.CAMERA)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            need.add(Manifest.permission.RECORD_AUDIO)
        }

        if (need.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, need.toTypedArray(), REQ_CAMERA_MIC)
        } else {
            notifyJsPermissionResult(true)
        }
    }

    // 申请通知权限（Android 13+）
    fun requestNotificationPermissionFromJs() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    REQ_NOTIFICATION
                )
                return
            }
        }
        // 不需要或者已有权限
        notifyJsNotificationReady()
    }

    private fun notifyJsPermissionResult(granted: Boolean) {
        val js =
            "window.onNativePermissionResult && window.onNativePermissionResult(${granted});"
        webView.evaluateJavascript(js, null)
    }

    private fun notifyJsNotificationReady() {
        val js =
            "window.onNotificationPermissionReady && window.onNotificationPermissionReady();"
        webView.evaluateJavascript(js, null)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            REQ_CAMERA_MIC -> {
                val granted =
                    grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
                notifyJsPermissionResult(granted)
            }

            REQ_NOTIFICATION -> {
                val granted =
                    grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
                if (granted) {
                    notifyJsNotificationReady()
                }
            }
        }
    }

    // 创建通知通道
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Chat"
            val descriptionText = "Chat message notifications"
            val importance = NotificationManager.IMPORTANCE_DEFAULT
            val channel =
                NotificationChannel(NOTIFICATION_CHANNEL_ID, name, importance).apply {
                    description = descriptionText
                }
            val notificationManager =
                getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    // 发送通知（给 JS 用）
    fun showLocalNotification(title: String, message: String) {
        val builder = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(message)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)

        with(NotificationManagerCompat.from(this)) {
            notify(
                (System.currentTimeMillis() % Int.MAX_VALUE).toInt(),
                builder.build()
            )
        }
    }

    override fun onBackPressed() {
        if (this::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
