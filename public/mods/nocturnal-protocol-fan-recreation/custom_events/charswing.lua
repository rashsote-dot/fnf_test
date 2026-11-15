local swingEnabled = false

local progress = 1
local duration = 0

local startAngle = 5
local targetAngle = -5

function onEvent(name, value1, value2)
    if name == 'CharSwing' then
        if value1 == 'on' then
            swingEnabled = true
            duration = crochet / 1000
        else
            swingEnabled = false
            setProperty('boyfriend.angle', 0)
            setProperty('dad.angle', 0)
            setProperty('forest4.angle', 0)
        end
    end
end

function onBeatHit()
    if swingEnabled then
        startAngle = targetAngle
        targetAngle = -targetAngle
        progress = 0
    end
end

function onUpdate(elapsed)
    if swingEnabled then
        progress = math.min(progress + elapsed / duration, 1)

        local eased = progress ^ 4

        local angle = startAngle + (targetAngle - startAngle) * eased

        setProperty('boyfriend.angle', angle)
        setProperty('dad.angle', angle)
        setProperty('forest4.angle', angle)
    end
end