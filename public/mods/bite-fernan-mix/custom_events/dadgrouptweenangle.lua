local enable = false
			
function onEvent(name, value1, value2)
	if name == 'DadGroupTweenAngle' then
		doTweenAngle('dadGrouTweenpAngle', 'dadGroup', value1, value2, 'SineInOut')
		--doTweenAngle('dadGroupAngle', 'dadGroup', angleOfs, 0.1, 'Linear')
	end
	
	if value1 == '' and value2 == '' then
		doTweenAngle('dadGrouTweenpAngle', 'dadGroup', 0, 0.25, 'SineInOut')
	end
end