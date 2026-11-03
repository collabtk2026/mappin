plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "io.github.bgplay"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.bgplay"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // 개인 사이드로드용: 디버그 키로 서명. 배포하려면 자체 키스토어로 교체.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    // iOS와 공유: shared/js/bgplay.js -> assets/bgplay.js, shared/web/library/* -> assets/library/*
    sourceSets {
        getByName("main") {
            assets.srcDirs("src/main/assets", "../../shared/js", "../../shared/web")
        }
    }
}

dependencies {
    // addDocumentStartJavaScript / addWebMessageListener (origin 제한 브리지)
    implementation("androidx.webkit:webkit:1.12.1")
}
