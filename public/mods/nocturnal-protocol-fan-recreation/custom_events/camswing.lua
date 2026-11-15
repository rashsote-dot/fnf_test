local camSwing = false
local swingTime = 1
local swingSpeed = 0.8
local swingAmount = 1

function onEvent(name, value1, value2)
    if name == 'CamSwing' then
        if value1 == 'on' then
            camSwing = true
        else
            camSwing = false
            setProperty('camGame.angle', 0)
        end
    end
end

function onUpdate(elapsed)
    if camSwing then
        swingTime = swingTime + elapsed * swingSpeed
        local angle = math.sin(swingTime) * swingAmount
        setProperty('camGame.angle', angle)
    end
end