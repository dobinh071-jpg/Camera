import express from "express";
import { createServer as createViteServer } from "vite";
import { request } from "urllib";
import net from "net";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API route to proxy camera images
  app.get("/api/proxy/image", async (req, res) => {
    const { url, username, password } = req.query;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).send("Missing url parameter");
    }

    try {
      const targetUrl = url.trim();
      const options: any = {
        timeout: 15000, // 15 seconds timeout
        followRedirect: true,
        rejectUnauthorized: false, // Ignore self-signed cert errors
      };
      
      let response;

      if (username && password) {
        // Try Basic Auth first
        options.auth = `${username}:${password}`;
        response = await request(targetUrl, options);
        
        // If 401 Unauthorized, try Digest Auth
        if (response.status === 401) {
          delete options.auth;
          options.digestAuth = `${username}:${password}`;
          response = await request(targetUrl, options);
        }
      } else {
        response = await request(targetUrl, options);
      }
      
      // If 404 Not Found or 401 Unauthorized, try the alternative URL format (Hikvision <-> Dahua)
      if (response.status === 404 || response.status === 401) {
        let altUrl = '';
        if (targetUrl.includes('ISAPI/Streaming/channels/101/picture')) {
          altUrl = targetUrl.replace('ISAPI/Streaming/channels/101/picture', 'cgi-bin/snapshot.cgi?channel=1');
        } else if (targetUrl.includes('cgi-bin/snapshot.cgi?channel=1')) {
          altUrl = targetUrl.replace('cgi-bin/snapshot.cgi?channel=1', 'ISAPI/Streaming/channels/101/picture');
        }
        
        if (altUrl) {
          console.log(`URL ${targetUrl} returned ${response.status}, trying alternative: ${altUrl}`);
          let altResponse;
          if (username && password) {
            options.auth = `${username}:${password}`;
            delete options.digestAuth;
            altResponse = await request(altUrl, options);
            if (altResponse.status === 401) {
              delete options.auth;
              options.digestAuth = `${username}:${password}`;
              altResponse = await request(altUrl, options);
            }
          } else {
            altResponse = await request(altUrl, options);
          }
          
          if (altResponse.status === 200) {
            response = altResponse;
          }
        }
      }
      
      if (response.status !== 200) {
        return res.status(response.status).send(`Camera returned ${response.status}`);
      }

      const contentType = response.headers['content-type'];
      if (contentType) {
        res.setHeader('Content-Type', contentType as string);
      }
      
      // Stream the image data to the client
      res.send(response.data);
    } catch (error: any) {
      console.error("Proxy error for", req.query.url, ":", error.message);
      res.status(500).send("Failed to proxy image");
    }
  });

  // API route to ping a host (TCP ping)
  app.get("/api/proxy/ping", (req, res) => {
    const { host } = req.query;
    if (!host || typeof host !== 'string') {
      return res.status(400).json({ alive: false });
    }

    let targetHost = host.trim();
    let targetPort = 80;

    if (targetHost.startsWith('https://')) {
      targetPort = 443;
    }
    
    targetHost = targetHost.replace(/^https?:\/\//, '');

    if (targetHost.includes(':')) {
      const parts = targetHost.split(':');
      targetHost = parts[0];
      targetPort = parseInt(parts[1], 10) || targetPort;
    }
    
    targetHost = targetHost.split('/')[0];

    const socket = new net.Socket();
    let isAlive = false;
    let responded = false;

    const finish = (alive: boolean) => {
      if (!responded) {
        responded = true;
        res.json({ alive });
        socket.destroy();
      }
    };

    socket.setTimeout(3000); // 3 seconds timeout for ping

    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));

    try {
      socket.connect(targetPort, targetHost);
    } catch (e) {
      finish(false);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    // Fallback to serve index.html explicitly if Vite middleware doesn't catch it
    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        const fs = await import('fs');
        const path = await import('path');
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const path = await import('path');
    app.use(express.static("dist"));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`To access from other devices on your network, use your computer's IP address: http://<YOUR_IP_ADDRESS>:${PORT}`);
    
    // Auto-open browser
    try {
      const url = `http://localhost:${PORT}`;
      const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      import('child_process').then(({ exec }) => {
        exec(`${start} ${url}`);
      });
    } catch (e) {
      // Ignore errors if browser fails to open
    }
  });
}

startServer();
