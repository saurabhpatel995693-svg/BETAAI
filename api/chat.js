        if (!modelsToTry.includes(normalized)) {
          modelsToTry.unshift(normalized);
        }
      }

      for (const model of modelsToTry) {
        try {
          const body = {
            messages,
            temperature: payload.temperature || 0.3,
            max_tokens: payload.max_tokens || 4096
          };

          const apiRes = await tryProvider(provider, model, body, wantsStream);

          if (wantsStream && apiRes.body) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            const reader = apiRes.body.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
              }
            } catch (e) { /* stream end */ }
            res.end();
            return;
          }

          const data = await apiRes.json();
          return res.status(200).json(data);
        } catch (e) {
          lastErr = `${provider.name}/${model}: ${e.message}`;
          console.warn(`[AI Failover] ${provider.name}/${model} failed:`, e.message);
        }
      }
    }

    // Ultimate Failover Tier: OpenRouter Public Free Tier
    try {
      const fallbackRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Title': 'BETAAI' },
        body: JSON.stringify({
          model: isCodingMode ? 'google/gemini-2.5-flash:free' : 'meta-llama/llama-3.3-70b-instruct:free',
          messages,
          temperature: payload.temperature || 0.3,
          max_tokens: payload.max_tokens || 4096,
          stream: wantsStream
        })
      });

      if (fallbackRes.ok) {
        if (wantsStream && fallbackRes.body) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          const reader = fallbackRes.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
          } catch (e) {}
          res.end();
          return;
        }
        const data = await fallbackRes.json();
        return res.status(200).json(data);
      }
    } catch (e) {
      console.warn('[Ultimate Failover] Failed:', e.message);
    }

    return res.status(500).json({ error: { message: `All providers failed. ${lastErr}` } });
  } catch (e) {
    return res.status(400).json({ error: { message: e.message } });
  }
}
