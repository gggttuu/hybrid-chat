package com.example.hybridchat

import android.os.Build
import android.webkit.JavascriptInterface
import android.widget.Toast
import org.json.JSONObject

class WebAppInterface(private val activity: MainActivity) {

    // 给 H5 调用：获取设备信息（返回 JSON 字符串）
    @JavascriptInterface
    fun getDeviceInfo(): String {
        val json = JSONObject()
        json.put("manufacturer", Build.MANUFACTURER)   // 厂商
        json.put("model", Build.MODEL)                 // 型号
        json.put("osVersion", Build.VERSION.RELEASE)   // 系统版本
        json.put("sdkInt", Build.VERSION.SDK_INT)      // SDK
        json.put("packageName", activity.packageName)
        return json.toString()
    }

    // 给 H5 调用：申请相机 + 麦克风权限
    @JavascriptInterface
    fun requestCameraAndMic() {
        activity.runOnUiThread {
            activity.requestCameraAndMicPermissionsFromJs()
        }
    }

    // 给 H5 调用：申请通知权限（Android 13+）
    @JavascriptInterface
    fun requestNotificationPermission() {
        activity.runOnUiThread {
            activity.requestNotificationPermissionFromJs()
        }
    }

    // 给 H5 调用：发通知
    @JavascriptInterface
    fun showNotification(title: String, message: String) {
        activity.runOnUiThread {
            activity.showLocalNotification(title, message)
        }
    }

    // 简单吐司
    @JavascriptInterface
    fun showToast(text: String) {
        activity.runOnUiThread {
            Toast.makeText(activity, text, Toast.LENGTH_SHORT).show()
        }
    }
}
